const execa = require('execa');
const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');

/**
 * Git 명령어 실행 관련 함수들
 */
class Executor {
  constructor() {
    this.dryRun = false;
  }

  /**
   * Git 명령어 실행
   * @param {string} command - 실행할 Git 명령어
   * @param {Object} options - 실행 옵션
   * @returns {Promise<Object>} 실행 결과
   */
  async executeCommand(command, options = {}) {
    try {
      console.log(chalk.blue('🔄 명령어 실행 중...'));
      console.log(chalk.cyan(`💻 명령어: ${command}`));
      
      // 안전성 검사
      if (await this.isDangerousCommand(command)) {
        const confirmed = await this.confirmExecution(command);
        if (!confirmed) {
          console.log(chalk.yellow('⚠️  실행이 취소되었습니다.'));
          return { success: false, cancelled: true };
        }
      }

      // 드라이런 모드 체크
      if (this.dryRun || options.dryRun) {
        console.log(chalk.yellow('🧪 드라이런 모드: 실제로 실행되지 않습니다.'));
        return { success: true, dryRun: true, command };
      }

      // 명령어 파싱
      const [cmd, ...args] = command.split(' ');
      
      // 명령어 실행
      const result = await execa(cmd, args, {
        stdio: 'inherit',
        cwd: process.cwd(),
        ...options
      });

      console.log(chalk.green('✅ 명령어가 성공적으로 실행되었습니다.'));
      return { success: true, result };
      
    } catch (error) {
      console.error(chalk.red('❌ 명령어 실행 실패:'), error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 여러 명령어를 모드에 따라 실행
   * @param {Array<string>} commands - 실행할 명령어 배열
   * @param {Object} options - 실행 옵션 { mode: 'dry'|'auto'|'interactive' }
   * @returns {Promise<Array>} 실행 결과 배열
   */
  async executeMultipleCommands(commands, options = {}) {
    const { mode = 'dry' } = options;
    const results = [];

    if (mode === 'dry') {
      // 드라이런 모드: 실행하지 않고 결과만 반환
      console.log(chalk.yellow('\n🧪 드라이런 모드: 명령어들을 실행하지 않습니다.'));
      return commands.map(command => ({
        success: true,
        dryRun: true,
        command
      }));
    }

    if (mode === 'auto') {
      // 자동 모드: 모든 명령어를 순서대로 실행
      console.log(chalk.blue('\n🚀 자동 실행 모드 시작'));
      
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        console.log(chalk.cyan(`\n📋 ${i + 1}/${commands.length}: ${command}`));
        
        const result = await this.executeCommand(command, { dryRun: false });
        results.push(result);
        
        if (!result.success && !result.cancelled) {
          console.log(chalk.red(`❌ 명령어 실행 실패. 남은 명령어 ${commands.length - i - 1}개를 건너뜁니다.`));
          break;
        }
        
        if (result.cancelled) {
          console.log(chalk.yellow(`⚠️  명령어 실행이 취소되었습니다. 남은 명령어 ${commands.length - i - 1}개를 건너뜁니다.`));
          break;
        }

        // 명령어 간 짧은 대기 시간
        if (i < commands.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      return results;
    }

    if (mode === 'interactive') {
      // 인터랙티브 모드: 각 명령어마다 사용자 확인
      console.log(chalk.blue('\n🔍 인터랙티브 모드 시작'));
      
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        
        console.log(chalk.cyan(`\n📋 ${i + 1}/${commands.length}: ${command}`));
        
        const choices = [
          { name: '✅ 실행', value: 'execute' },
          { name: '⏭️  건너뛰기', value: 'skip' },
          { name: '❌ 종료', value: 'quit' }
        ];

        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: '이 명령어를 실행하시겠습니까?',
            choices
          }
        ]);

        if (action === 'quit') {
          console.log(chalk.yellow('🛑 사용자가 실행을 중단했습니다.'));
          break;
        }

        if (action === 'skip') {
          console.log(chalk.yellow('⏭️  명령어를 건너뜁니다.'));
          results.push({ success: true, skipped: true, command });
          continue;
        }

        if (action === 'execute') {
          const result = await this.executeCommand(command, { dryRun: false });
          results.push(result);
          
          if (!result.success && !result.cancelled) {
            const { continueOnError } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'continueOnError',
                message: '명령어 실행이 실패했습니다. 계속 진행하시겠습니까?',
                default: false
              }
            ]);
            
            if (!continueOnError) {
              console.log(chalk.red('❌ 사용자가 실행을 중단했습니다.'));
              break;
            }
          }
        }
      }
      
      return results;
    }

    return results;
  }

  /**
   * 여러 명령어 순차 실행 (기존 함수 - 호환성 유지)
   * @param {Array<string>} commands - 실행할 명령어 배열
   * @param {Object} options - 실행 옵션
   * @returns {Promise<Array>} 실행 결과 배열
   */
  async executeMultipleCommandsLegacy(commands, options = {}) {
    const results = [];
    
    for (const command of commands) {
      const result = await this.executeCommand(command, options);
      results.push(result);
      
      // 중간에 실패하면 중단
      if (!result.success && !options.continueOnError) {
        break;
      }
    }
    
    return results;
  }

  /**
   * 위험한 명령어인지 확인
   * @param {string} command - 확인할 명령어
   * @returns {Promise<boolean>} 위험한 명령어 여부
   */
  async isDangerousCommand(command) {
    const dangerousPatterns = [
      /git\s+reset\s+--hard/,
      /git\s+clean\s+-f/,
      /git\s+push\s+--force/,
      /git\s+rebase\s+--interactive/,
      /git\s+branch\s+-D/,
      /git\s+tag\s+-d/,
      /rm\s+-rf/,
      /git\s+filter-branch/
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(command));
  }

  /**
   * 명령어 실행 확인
   * @param {string} command - 실행할 명령어
   * @returns {Promise<boolean>} 실행 확인 여부
   */
  async confirmExecution(command) {
    console.log(chalk.yellow('\n⚠️  주의: 이 명령어는 위험할 수 있습니다.'));
    console.log(chalk.red(`🔥 명령어: ${command}`));
    
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '정말로 실행하시겠습니까?',
        default: false
      }
    ]);
    
    return answer.confirm;
  }

  /**
   * 현재 Git 상태 확인
   * @returns {Promise<Object>} Git 상태 정보
   */
  async getGitStatus() {
    const currentDir = process.cwd();
    
    try {
      // Git 저장소인지 확인 (Windows 환경 고려)
      const gitCheckResult = await execa('git', ['rev-parse', '--git-dir'], { 
        cwd: currentDir,
        stdio: 'pipe', // Windows에서 stdio 설정 명시
        timeout: 5000 // 5초 타임아웃
      });
      
      // 기본 Git 정보 수집
      const [statusResult, branchResult, repoRootResult] = await Promise.all([
        execa('git', ['status', '--porcelain'], { cwd: currentDir, stdio: 'pipe' }),
        execa('git', ['branch', '--show-current'], { cwd: currentDir, stdio: 'pipe' }),
        execa('git', ['rev-parse', '--show-toplevel'], { cwd: currentDir, stdio: 'pipe' })
      ]);
      
      // 원격 저장소 URL 확인
      let remoteUrl = '';
      let repositoryName = '';
      try {
        const remoteResult = await execa('git', ['remote', 'get-url', 'origin'], { 
          cwd: currentDir, 
          stdio: 'pipe' 
        });
        remoteUrl = remoteResult.stdout.trim();
        
        // 레포지토리 이름 추출
        const urlMatch = remoteUrl.match(/([^\/]+)\.git$/);
        if (urlMatch) {
          repositoryName = urlMatch[1];
        } else {
          const pathMatch = remoteUrl.match(/([^\/]+)$/);
          if (pathMatch) {
            repositoryName = pathMatch[1];
          }
        }
      } catch (error) {
        // 원격 저장소가 없는 경우 로컬 디렉토리 이름 사용
        repositoryName = require('path').basename(repoRootResult.stdout.trim());
      }
      
      // 커밋되지 않은 변경사항 확인
      const hasUncommittedChanges = statusResult.stdout.trim().length > 0;
      
      // 푸시되지 않은 커밋 확인
      let hasUnpushedCommits = false;
      try {
        const unpushedResult = await execa('git', ['log', '@{u}..', '--oneline'], { 
          cwd: currentDir, 
          stdio: 'pipe' 
        });
        hasUnpushedCommits = unpushedResult.stdout.trim().length > 0;
      } catch (error) {
        // 원격 브랜치가 없는 경우 무시
      }
      
      // 커밋 히스토리 확인
      let totalCommits = 0;
      try {
        const commitsResult = await execa('git', ['rev-list', '--count', 'HEAD'], { 
          cwd: currentDir, 
          stdio: 'pipe' 
        });
        totalCommits = parseInt(commitsResult.stdout.trim());
      } catch (error) {
        // 커밋이 없는 경우
      }
      
      return {
        currentBranch: branchResult.stdout.trim(),
        repositoryName,
        remoteUrl,
        repoRoot: repoRootResult.stdout.trim(),
        currentDir,
        hasUncommittedChanges,
        hasUnpushedCommits,
        workingTree: statusResult.stdout.trim(),
        totalCommits,
        isGitRepository: true,
        isInRepoRoot: path.resolve(currentDir) === path.resolve(repoRootResult.stdout.trim())
      };
    } catch (error) {
      // Git 레포지토리가 아닌 경우 또는 Git 명령어 실행 실패
      return {
        currentBranch: null,
        repositoryName: '',
        remoteUrl: '',
        repoRoot: '',
        currentDir,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        workingTree: '',
        totalCommits: 0,
        isGitRepository: false,
        isInRepoRoot: false,
        error: error.message
      };
    }
  }

  /**
   * 명령어 미리보기
   * @param {string} command - 미리보기할 명령어
   */
  async previewCommand(command) {
    console.log(chalk.blue('👀 명령어 미리보기:'));
    console.log(chalk.cyan(`💻 ${command}`));
    
    // 현재 Git 상태 표시
    const status = await this.getGitStatus();
    if (status.isGitRepository) {
      if (status.currentBranch) {
        console.log(chalk.gray(`📍 현재 브랜치: ${status.currentBranch}`));
      }
      if (status.hasUncommittedChanges) {
        console.log(chalk.gray('📝 커밋되지 않은 변경사항이 있습니다.'));
      }
      if (status.hasUnpushedCommits) {
        console.log(chalk.gray('📤 푸시되지 않은 커밋이 있습니다.'));
      }
    } else {
      console.log(chalk.yellow('⚠️  Git 저장소가 아닙니다.'));
    }
  }

  /**
   * 명령어 실행 결과 요약
   * @param {Array} results - 실행 결과 배열
   */
  printExecutionSummary(results) {
    if (results.length === 0) {
      console.log(chalk.yellow('📋 실행된 명령어가 없습니다.'));
      return;
    }

    console.log(chalk.blue('\n📊 실행 결과 요약:'));
    console.log(chalk.gray(`총 ${results.length}개 명령어`));
    
    const successful = results.filter(r => r.success && !r.dryRun && !r.skipped).length;
    const failed = results.filter(r => !r.success && !r.cancelled).length;
    const cancelled = results.filter(r => r.cancelled).length;
    const skipped = results.filter(r => r.skipped).length;
    const dryRun = results.filter(r => r.dryRun).length;

    if (successful > 0) console.log(chalk.green(`✅ 성공: ${successful}개`));
    if (failed > 0) console.log(chalk.red(`❌ 실패: ${failed}개`));
    if (cancelled > 0) console.log(chalk.yellow(`⚠️  취소: ${cancelled}개`));
    if (skipped > 0) console.log(chalk.gray(`⏭️  건너뜀: ${skipped}개`));
    if (dryRun > 0) console.log(chalk.blue(`🧪 드라이런: ${dryRun}개`));
  }

  /**
   * 드라이런 모드 설정
   * @param {boolean} enabled - 드라이런 모드 활성화 여부
   */
  setDryRun(enabled) {
    this.dryRun = enabled;
    if (enabled) {
      console.log(chalk.yellow('🧪 드라이런 모드가 활성화되었습니다.'));
    } else {
      console.log(chalk.blue('🔄 실제 실행 모드로 변경되었습니다.'));
    }
  }

  /**
   * Git 상태 정보를 화면에 표시
   * @param {Object} gitStatus - Git 상태 정보
   */
  displayGitStatus(gitStatus) {
    console.log(chalk.blue('📍 현재 위치 정보:'));
    
    if (gitStatus.isGitRepository) {
      // Git 레포지토리인 경우
      console.log(chalk.green(`✅ Git 레포지토리: ${gitStatus.repositoryName}`));
      
      if (gitStatus.remoteUrl) {
        console.log(chalk.gray(`🔗 원격 저장소: ${gitStatus.remoteUrl}`));
      } else {
        console.log(chalk.gray('🔗 원격 저장소: 로컬 전용'));
      }
      
      console.log(chalk.gray(`📁 레포지토리 루트: ${gitStatus.repoRoot}`));
      
      if (!gitStatus.isInRepoRoot) {
        console.log(chalk.yellow(`⚠️  현재 위치: ${gitStatus.currentDir}`));
        console.log(chalk.yellow('   (레포지토리 루트가 아님)'));
      }
      
      if (gitStatus.currentBranch) {
        console.log(chalk.cyan(`🌿 현재 브랜치: ${gitStatus.currentBranch}`));
      }
      
      if (gitStatus.totalCommits > 0) {
        console.log(chalk.gray(`📊 총 커밋 수: ${gitStatus.totalCommits}개`));
      }
      
      // 상태 표시
      const statusItems = [];
      if (gitStatus.hasUncommittedChanges) {
        statusItems.push(chalk.yellow('📝 미커밋 변경사항'));
      }
      if (gitStatus.hasUnpushedCommits) {
        statusItems.push(chalk.blue('📤 미푸시 커밋'));
      }
      if (statusItems.length === 0) {
        statusItems.push(chalk.green('✨ 클린 상태'));
      }
      
      console.log(chalk.gray(`📋 상태: ${statusItems.join(', ')}`));
      
    } else {
      // Git 레포지토리가 아닌 경우
      console.log(chalk.red('❌ Git 레포지토리가 아닙니다'));
      console.log(chalk.gray(`📁 현재 위치: ${gitStatus.currentDir}`));
      console.log(chalk.gray('💡 "git init"으로 레포지토리를 초기화하거나'));
      console.log(chalk.gray('   Git 레포지토리 폴더에서 명령어를 실행하세요'));
    }
  }
}

module.exports = new Executor(); 