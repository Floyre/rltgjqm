const execa = require('execa');
const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');
const aiService = require('./aiService');
const config = require('./config');

/**
 * Git 명령어 실행 관련 함수들
 */
class Executor {
  constructor() {
    this.dryRun = false;
    this.autoSuggestSolutions = true; // 자동 해결책 제안 기능
  }

  /**
   * 명령어 파싱 (따옴표 고려)
   * @param {string} command - 파싱할 명령어
   * @returns {Array<string>} 파싱된 명령어 배열
   */
  parseCommand(command) {
    const args = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      
      if ((char === '"' || char === "'") && !inQuotes) {
        // 따옴표 시작
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        // 따옴표 끝
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        // 공백이고 따옴표 안이 아님
        if (current.trim()) {
          args.push(current.trim());
          current = '';
        }
      } else {
        // 일반 문자
        current += char;
      }
    }
    
    // 마지막 인수 추가
    if (current.trim()) {
      args.push(current.trim());
    }
    
    return args;
  }

  /**
   * Git 명령어 실행
   * @param {string} command - 실행할 Git 명령어
   * @param {Object} options - 실행 옵션
   * @returns {Promise<Object>} 실행 결과
   */
  async executeCommand(command, options = {}) {
    try {
      console.log(chalk.white('🔄 명령어 실행 중...'));
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

      // 명령어 파싱 (따옴표 고려)
      const parsedCommand = this.parseCommand(command);
      const cmd = parsedCommand[0];
      const args = parsedCommand.slice(1);
      
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
      
      // 자동 오류 해결 제안 (무한 루프 방지)
      const autoSuggestEnabled = config.getAutoSuggestSolutions();
      if (autoSuggestEnabled && !options.skipSuggestion) {
        await this.suggestErrorSolution(command, error.message);
      }
      
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
      console.log(chalk.white('\n🚀 자동 실행 모드 시작'));
      
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
      console.log(chalk.white('\n🔍 인터랙티브 모드 시작'));
      
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
   * 오류 발생 시 AI에게 해결책 요청 (1단계: 선택지 제공)
   * @param {string} command - 실패한 명령어
   * @param {string} errorMessage - 오류 메시지
   */
  async suggestErrorSolution(command, errorMessage) {
    try {
      console.log(chalk.yellow('\n🤖 AI가 해결책을 찾고 있습니다...'));
      
      const prompt = `Git 명령어 "${command}" 실행 중 다음 오류가 발생했습니다:

${errorMessage}

이 오류에 대한 해결 방법을 3가지 선택지로 제공해주세요. 각 선택지는 다음 형식으로:

1. [방법명]: [간단한 설명]
2. [방법명]: [간단한 설명]  
3. [방법명]: [간단한 설명]

구체적인 명령어는 제공하지 말고, 해결 방향성만 알려주세요.`;

      const result = await aiService.generateCommand(prompt);
      const response = result.response;
      
      // 사용자 선택 받기 (AI 해결책을 바로 선택지로 표시)
      await this.getUserSolutionChoice(command, errorMessage, response);
      
    } catch (error) {
      console.log(chalk.gray('⚠️  해결책 요청 중 오류가 발생했습니다.'));
    }
  }

  /**
   * 사용자 해결책 선택 및 구체적 명령어 요청 (2단계)
   * @param {string} command - 원래 실패한 명령어
   * @param {string} errorMessage - 오류 메시지
   * @param {string} solutionOptions - AI가 제공한 선택지들
   */
  async getUserSolutionChoice(command, errorMessage, solutionOptions) {
    try {
      // 선택지 파싱 (1. 2. 3. 형태)
      const options = this.parseSolutionOptions(solutionOptions);
      
      if (options.length === 0) {
        console.log(chalk.yellow('⚠️  선택지를 파싱할 수 없습니다. 직접 해결해 주세요.'));
        return;
      }

      console.log(chalk.blue('\n💡 AI 해결책 제안:'));
      options.forEach((option, index) => {
        console.log(chalk.yellow(`${index + 1}. ${option.title}`));
        console.log(chalk.gray(`   ${option.description}`));
      });

      // inquirer에서는 간단하게 번호만 표시
      const choices = options.map((option, index) => ({
        name: `${index + 1}번`,
        value: index
      }));
      
      // 직접 입력 옵션 추가
      const directInputIndex = options.length;
      choices.push({ name: `${directInputIndex + 1}번 (💭 직접 입력)`, value: directInputIndex });
      choices.push({ name: '❌ 취소', value: -1 });

      const { selectedIndex } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedIndex',
          message: '어떤 방법으로 해결하시겠습니까?',
          choices
        }
      ]);

      if (selectedIndex === -1) {
        console.log(chalk.gray('해결 과정을 취소했습니다.'));
        return;
      }

      // 직접 입력 선택한 경우
      if (selectedIndex === directInputIndex) {
        const { customSolution } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customSolution',
            message: '원하시는 해결 방법을 입력하세요:',
            validate: (input) => {
              // 한글 입력 최적화: 입력 완료 후에만 검증
              if (input === '') {
                return '해결 방법을 입력해주세요.';
              }
              const trimmed = input.trim();
              if (trimmed.length === 0) {
                return '해결 방법을 입력해주세요.';
              }
              return true;
            },
            prefix: '',
            suffix: '',
            transformer: (input) => input,
            filter: (input) => input.trim()
          }
        ]);
        
        // 직접 입력한 해결법의 구체적 명령어 요청
        await this.getSpecificSolution(command, errorMessage, customSolution);
      } else {
        // 선택된 해결법의 구체적 명령어 요청
        await this.getSpecificSolution(command, errorMessage, options[selectedIndex].fullText);
      }

    } catch (error) {
      console.log(chalk.gray('⚠️  해결책 선택 중 오류가 발생했습니다.'));
    }
  }

  /**
   * 마크다운 문자 제거
   * @param {string} text - 마크다운이 포함된 텍스트
   * @returns {string} 마크다운이 제거된 텍스트
   */
  removeMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')  // **볼드** → 볼드
      .replace(/\*(.+?)\*/g, '$1')      // *이탤릭* → 이탤릭
      .replace(/`(.+?)`/g, '$1')        // `코드` → 코드
      .replace(/~~(.+?)~~/g, '$1')      // ~~취소선~~ → 취소선
      .trim();
  }

  /**
   * 선택지 파싱 (1. 2. 3. 형태에서 추출)
   * @param {string} solutionOptions - AI 응답
   * @returns {Array<Object>} 파싱된 선택지들 {title, description}
   */
  parseSolutionOptions(solutionOptions) {
    const lines = solutionOptions.split('\n');
    const options = [];
    
    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(.+)/);
      if (match) {
        const fullText = this.removeMarkdown(match[1].trim());
        // **제목:** 설명 형태에서 제목과 설명 분리
        const titleMatch = fullText.match(/^(.+?):\s*(.+)/);
        if (titleMatch) {
          options.push({
            title: titleMatch[1].trim(),
            description: titleMatch[2].trim(),
            fullText: fullText
          });
        } else {
          // 일반 텍스트인 경우 처음 40자를 제목으로 사용
          const title = fullText.length > 40 ? fullText.substring(0, 37) + '...' : fullText;
          options.push({
            title: title,
            description: fullText,
            fullText: fullText
          });
        }
      }
    }
    
    return options;
  }

  /**
   * 선택된 해결법의 구체적 명령어 요청 (2단계)
   * @param {string} command - 원래 실패한 명령어
   * @param {string} errorMessage - 오류 메시지  
   * @param {string} selectedSolution - 선택된 해결법
   */
  async getSpecificSolution(command, errorMessage, selectedSolution) {
    try {
      console.log(chalk.yellow('\n🤖 구체적인 해결 방법을 찾고 있습니다...'));
      
      const prompt = `Git 명령어 "${command}" 실행 중 다음 오류가 발생했고:

${errorMessage}

사용자가 다음 해결 방법을 선택했습니다:
"${selectedSolution}"

이 해결 방법을 위한 구체적인 Git 명령어들을 순서대로 제공해주세요. 각 명령어는 새 줄에 작성하고, 설명은 최소화해주세요.`;

      const result = await aiService.generateCommand(prompt);
      const response = result.response;
      
      console.log(chalk.blue('\n💡 구체적인 해결 명령어:'));
      console.log(chalk.white(response));
      
      // 명령어 추출 및 실행 옵션 제공
      await this.executeSpecificSolution(response);
      
    } catch (error) {
      console.log(chalk.gray('⚠️  구체적 해결책 요청 중 오류가 발생했습니다.'));
    }
  }

  /**
   * 구체적 해결책 명령어 실행
   * @param {string} solution - AI가 제공한 구체적 명령어들
   */
  async executeSpecificSolution(solution) {
    // Git 명령어 패턴 찾기
    const gitCommandPattern = /(?:^|\n)(?:`{0,3})\s*(git\s+[^\n`]+)/gmi;
    const matches = solution.match(gitCommandPattern);
    
    if (matches && matches.length > 0) {
      const commands = matches.map(match => match.replace(/[`\n]/g, '').trim());
      
      console.log(chalk.cyan('\n🔧 실행할 명령어:'));
      commands.forEach((cmd, index) => {
        console.log(chalk.yellow(`${index + 1}. ${cmd}`));
      });
      
      const { executionMode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'executionMode',
          message: '어떻게 실행하시겠습니까?',
          choices: [
            { name: '🚀 자동 실행 (모든 명령어 순서대로)', value: 'auto' },
            { name: '🔍 단계별 확인 (하나씩 확인 후 실행)', value: 'interactive' },
            { name: '🧪 드라이런 (실행하지 않고 미리보기)', value: 'dry' },
            { name: '❌ 취소', value: 'cancel' }
          ]
        }
      ]);

      if (executionMode === 'cancel') {
        console.log(chalk.gray('실행을 취소했습니다.'));
        return;
      }

      // 기존 executor의 다중 명령어 실행 기능 활용
      await this.executeMultipleCommands(commands, { 
        mode: executionMode,
        skipSuggestion: true  // 무한 루프 방지
      });
      
    } else {
      console.log(chalk.yellow('⚠️  실행 가능한 Git 명령어를 찾을 수 없습니다.'));
    }
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
      
      // Git 레포지토리 루트 확인
      const repoRootResult = await execa('git', ['rev-parse', '--show-toplevel'], { 
        cwd: currentDir, 
        stdio: 'pipe' 
      });
      const repoRoot = path.resolve(repoRootResult.stdout.trim());
      const currentDirResolved = path.resolve(currentDir);
      
      // 더 엄격한 검증: 현재 디렉토리가 레포지토리 루트와 너무 멀리 떨어져 있는지 확인
      const relativePath = path.relative(repoRoot, currentDirResolved);
      
      // 현재 디렉토리가 레포지토리 외부에 있거나, 3단계 이상 깊은 곳에 있으면 제외
      if (relativePath.startsWith('..') || relativePath.split(path.sep).length > 3) {
        throw new Error('현재 디렉토리가 Git 레포지토리와 관련이 없습니다.');
      }
      
      // 추가 검증: 현재 디렉토리나 바로 상위 디렉토리에 의미있는 Git 관련 파일이 있는지 확인
      const hasGitFiles = await this.checkForGitFiles(currentDirResolved, repoRoot);
      if (!hasGitFiles) {
        throw new Error('현재 위치에서 Git 작업을 수행할 의도가 명확하지 않습니다.');
      }
      
      // 기본 Git 정보 수집
      const [statusResult, branchResult] = await Promise.all([
        execa('git', ['status', '--porcelain'], { cwd: currentDir, stdio: 'pipe' }),
        execa('git', ['branch', '--show-current'], { cwd: currentDir, stdio: 'pipe' })
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
        
        // 레포지토리 이름 추출 (다양한 URL 형태 지원)
        repositoryName = this.extractRepositoryName(remoteUrl);
        
        // 레포지토리 이름이 추출되지 않은 경우 fallback
        if (!repositoryName) {
          repositoryName = require('path').basename(repoRoot);
          console.warn('⚠️  Git URL에서 레포지토리 이름을 추출할 수 없어 디렉토리 이름을 사용합니다:', remoteUrl);
        }
      } catch (error) {
        // 원격 저장소가 없는 경우 로컬 디렉토리 이름 사용
        repositoryName = require('path').basename(repoRoot);
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
        repoRoot: repoRoot,
        currentDir,
        hasUncommittedChanges,
        hasUnpushedCommits,
        workingTree: statusResult.stdout.trim(),
        totalCommits,
        isGitRepository: true,
        isInRepoRoot: path.resolve(currentDir) === path.resolve(repoRoot)
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
   * Git 원격 URL에서 레포지토리 이름 추출
   * @param {string} remoteUrl - Git 원격 URL
   * @returns {string} 레포지토리 이름
   */
  extractRepositoryName(remoteUrl) {
    if (!remoteUrl || typeof remoteUrl !== 'string') {
      return '';
    }

    // URL에서 템플릿 태그 감지 (사용자가 보고한 문제 해결)
    if (remoteUrl.includes('<') && remoteUrl.includes('>')) {
      console.warn('⚠️  Git URL에 템플릿 태그가 포함되어 있습니다:', remoteUrl);
      console.warn('💡 해결방법: git remote set-url origin <실제_저장소_URL>');
      console.warn('💡 또는 Git 레포지토리 제거: rm -rf .git');
      return '';
    }

    try {
      let repoName = '';

      // 1. SSH URL 형태: git@github.com:user/repo.git
      const sshMatch = remoteUrl.match(/^git@[^:]+:([^\/]+)\/([^\/]+?)(?:\.git)?$/);
      if (sshMatch) {
        repoName = sshMatch[2];
      }
      // 2. HTTPS URL 형태: https://github.com/user/repo.git
      else if (remoteUrl.startsWith('http')) {
        const httpsMatch = remoteUrl.match(/\/([^\/]+?)(?:\.git)?(?:\/)?$/);
        if (httpsMatch) {
          repoName = httpsMatch[1];
        }
      }
      // 3. 기타 형태
      else {
        const generalMatch = remoteUrl.match(/([^\/\\:]+?)(?:\.git)?$/);
        if (generalMatch) {
          repoName = generalMatch[1];
        }
      }

      // 레포지토리 이름이 유효한지 확인
      if (repoName && repoName.length > 0 && repoName !== '.' && repoName !== '..') {
        return repoName;
      }

      // 모든 파싱이 실패한 경우, URL의 마지막 부분을 사용
      const fallbackMatch = remoteUrl.split(/[\/\\]/).pop();
      if (fallbackMatch && fallbackMatch.length > 0) {
        return fallbackMatch.replace(/\.git$/, '');
      }

      return '';
    } catch (error) {
      console.warn('⚠️  Git URL 파싱 중 오류:', error.message);
      return '';
    }
  }

  /**
   * 현재 디렉토리에서 Git 작업을 할 의도가 있는지 확인
   * @param {string} currentDir - 현재 디렉토리
   * @param {string} repoRoot - Git 레포지토리 루트
   * @returns {Promise<boolean>} Git 작업 의도가 있는지 여부
   */
  async checkForGitFiles(currentDir, repoRoot) {
    const fs = require('fs').promises;
    
    try {
      // 현재 디렉토리가 레포지토리 루트인 경우 항상 허용
      if (path.resolve(currentDir) === path.resolve(repoRoot)) {
        return true;
      }
      
      // 현재 디렉토리에서 확인할 파일/폴더들
      const projectIndicators = [
        'package.json', 'package-lock.json', 'yarn.lock',
        'Cargo.toml', 'go.mod', 'requirements.txt', 'setup.py',
        'pom.xml', 'build.gradle', 'Makefile', 'CMakeLists.txt',
        'README.md', 'README.txt', 'LICENSE', '.gitignore',
        'src', 'lib', 'app', 'components', 'pages',
        '.github', '.vscode', '.idea',
        'index.js', 'index.ts', 'main.js', 'main.py', 'app.js',
        'tsconfig.json', 'webpack.config.js', 'vite.config.js'
      ];
      
      // 현재 디렉토리의 파일/폴더 목록 가져오기
      const files = await fs.readdir(currentDir);
      
      // 프로젝트 관련 파일이 하나라도 있으면 Git 작업 의도가 있다고 판단
      const hasProjectFiles = projectIndicators.some(indicator => 
        files.includes(indicator)
      );
      
      if (hasProjectFiles) {
        return true;
      }
      
      // 현재 디렉토리에 의미있는 파일이 많이 있으면 프로젝트 디렉토리로 판단
      const codeFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.js', '.ts', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', 
                '.html', '.css', '.scss', '.vue', '.jsx', '.tsx', '.md'].includes(ext);
      });
      
      // 코드 파일이 3개 이상 있으면 프로젝트 디렉토리로 판단
      if (codeFiles.length >= 3) {
        return true;
      }
      
      return false;
    } catch (error) {
      // 파일 시스템 접근 오류시 안전하게 false 반환
      return false;
    }
  }

  /**
   * 명령어 미리보기
   * @param {string} command - 미리보기할 명령어
   */
  async previewCommand(command) {
          console.log(chalk.white('👀 명령어 미리보기:'));
    console.log(chalk.cyan(`💻 ${command}`));
    
    // 현재 Git 상태 표시
    const status = await this.getGitStatus();
    if (status.isGitRepository) {
      if (status.currentBranch) {
        console.log(chalk.white(`📍 현재 브랜치: ${status.currentBranch}`));
      }
      if (status.hasUncommittedChanges) {
        console.log(chalk.white('📝 커밋되지 않은 변경사항이 있습니다.'));
      }
      if (status.hasUnpushedCommits) {
        console.log(chalk.white('📤 푸시되지 않은 커밋이 있습니다.'));
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

    console.log(chalk.white('\n📊 실행 결과 요약:'));
    console.log(chalk.white(`총 ${results.length}개 명령어`));
    
    const successful = results.filter(r => r.success && !r.dryRun && !r.skipped).length;
    const failed = results.filter(r => !r.success && !r.cancelled).length;
    const cancelled = results.filter(r => r.cancelled).length;
    const skipped = results.filter(r => r.skipped).length;
    const dryRun = results.filter(r => r.dryRun).length;

    if (successful > 0) console.log(chalk.green(`✅ 성공: ${successful}개`));
    if (failed > 0) console.log(chalk.red(`❌ 실패: ${failed}개`));
    if (cancelled > 0) console.log(chalk.yellow(`⚠️  취소: ${cancelled}개`));
    if (skipped > 0) console.log(chalk.white(`⏭️  건너뜀: ${skipped}개`));
    if (dryRun > 0) console.log(chalk.white(`🧪 드라이런: ${dryRun}개`));
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
      console.log(chalk.white('🔄 실제 실행 모드로 변경되었습니다.'));
    }
  }

  /**
   * Git 상태 정보를 화면에 표시
   * @param {Object} gitStatus - Git 상태 정보
   */
  displayGitStatus(gitStatus) {
    console.log(chalk.white(`${chalk.bold('📍 현재 폴더 git 정보:')}`));
    
    if (gitStatus.isGitRepository) {
      // Git 레포지토리인 경우
      console.log(chalk.green(`${chalk.bold('✅ 연결된 레포지토리 이름:')} ${gitStatus.repositoryName}`));
      
      if (gitStatus.remoteUrl) {
        console.log(chalk.white(`${chalk.bold('🔗 레포지토리 링크 :')} ${gitStatus.remoteUrl}`));
      } else {
        console.log(chalk.white(`${chalk.bold('🔗 레포지토리 링크 :')} 로컬 전용`));
      }
      
      console.log(chalk.white(`${chalk.bold('📁 레포지토리 경로 :')} ${gitStatus.repoRoot}`));
      
      if (!gitStatus.isInRepoRoot) {
        console.log(chalk.yellow(`⚠️  현재 위치: ${gitStatus.currentDir}`));
        console.log(chalk.yellow('   (레포지토리 루트가 아님)'));
      }
      
      if (gitStatus.currentBranch) {
        console.log(chalk.cyan(`${chalk.bold('🌿 현재 사용중인 브랜치:')} ${gitStatus.currentBranch}`));
      }
      
      // 상태 표시
      const statusItems = [];
      if (gitStatus.hasUncommittedChanges) {
        statusItems.push(chalk.yellow('📝 커밋되지 않은 변경사항이 있습니다!'));
      }
      if (gitStatus.hasUnpushedCommits) {
        statusItems.push(chalk.white('📤 푸시되지 않은 커밋이 있습니다!'));
      }
      if (statusItems.length === 0) {
        statusItems.push(chalk.green('✨ 아무런 문제가 없습니다. 완벽해요!'));
      }
      
      console.log(chalk.white(`${chalk.bold('📋 상태 :')} ${statusItems.join(', ')}`));
      
    } else {
      // Git 레포지토리가 아닌 경우
      console.log(chalk.red('❌ Git 레포지토리가 아닙니다'));
      console.log(chalk.white(`📁 현재 위치: ${gitStatus.currentDir}`));
      console.log(chalk.white('💡 "git init"으로 레포지토리를 초기화하거나'));
      console.log(chalk.white('   Git 레포지토리 폴더에서 명령어를 실행하세요'));
    }
  }
}

module.exports = new Executor(); 