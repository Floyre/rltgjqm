const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const os = require('os');

/**
 * 설정 관리 클래스
 */
class ConfigManager {
  constructor() {
    // 사용자별 설정 디렉토리 (사용자 홈 디렉토리)
    this.configDir = path.join(os.homedir(), '.rltgjqm');
    this.configFile = path.join(this.configDir, 'config.json');
    this.envFile = path.join(this.configDir, '.env');
    
    this.ensureConfigDir();
  }

  /**
   * 설정 디렉토리 생성
   */
  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * API 키 가져오기 (우선순위: 환경변수 > 사용자 설정)
   */
  getApiKey() {
    // 1. 환경변수에서 확인
    if (process.env.GEMINI_API_KEY) {
      return process.env.GEMINI_API_KEY;
    }

    // 2. 사용자 설정에서 확인
    const userKey = this.readEnvFile(this.envFile);
    if (userKey) {
      return userKey;
    }

    return null;
  }

  /**
   * .env 파일에서 API 키 읽기
   */
  readEnvFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(/GEMINI_API_KEY\s*=\s*(.+)/);
        return match ? match[1].trim().replace(/['"]/g, '') : null;
      }
    } catch (error) {
      // 파일 읽기 실패 시 무시
    }
    return null;
  }

  /**
   * API 키 설정 (사용자 홈 디렉토리에만 저장)
   */
  async setApiKey(apiKey) {
    const envContent = `# Gemini API Key for rltgjqm
GEMINI_API_KEY=${apiKey}

# 이 파일은 rltgjqm CLI 도구에서 자동 생성되었습니다.
# API 키를 변경하려면 'rltgjqm config' 명령어를 사용하세요.
`;

    try {
      fs.writeFileSync(this.envFile, envContent, 'utf-8');
      console.log(chalk.green(`✅ API 키가 저장되었습니다: ${this.envFile}`));
      return true;
    } catch (error) {
      console.error(chalk.red(`❌ API 키 저장 실패: ${error.message}`));
      return false;
    }
  }

  /**
   * 대화형 API 키 설정
   */
  async promptForApiKey() {
    console.clear();
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.blue('🔑 Gemini API 키 설정'));
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.gray('API 키는 https://ai.google.dev/ 에서 발급받을 수 있습니다.'));
    console.log(chalk.gray('취소하려면 "cancel" 또는 "exit"를 입력하세요.\n'));

    // 현재 경로 정보 표시
    console.log(chalk.gray('저장 위치:'));
    console.log(chalk.gray(`📁 ${this.envFile}\n`));

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Gemini API 키를 입력하세요:',
        mask: '*',
        validate: (input) => {
          if (!input) {
            return 'API 키를 입력해주세요.';
          }
          if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'exit') {
            return true; // 취소 명령어는 유효한 입력으로 처리
          }
          if (input.length < 10) {
            return 'API 키가 너무 짧습니다. 올바른 API 키를 입력하세요.';
          }
          return true;
        },
        prefix: '',
        suffix: ''
      }
    ]);

    // 취소 명령어 확인
    if (answers.apiKey.toLowerCase() === 'cancel' || answers.apiKey.toLowerCase() === 'exit') {
      console.log(chalk.blue('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('취소되었습니다.'));
      console.log(chalk.blue('─────────────────────────────────────────────'));
      return false;
    }

    const success = await this.setApiKey(answers.apiKey);
    
    if (success) {
      // 환경변수에도 설정 (현재 세션용)
      process.env.GEMINI_API_KEY = answers.apiKey;
      console.log(chalk.blue('\n─────────────────────────────────────────────'));
    }
    return success;
  }

  /**
   * 설정 상태 확인
   */
  checkConfigStatus() {
    const apiKey = this.getApiKey();
    const hasApiKey = !!apiKey;
    
    let keySource = '';
    if (process.env.GEMINI_API_KEY && !this.readEnvFile(this.envFile)) {
      keySource = '환경변수';
    } else if (this.readEnvFile(this.envFile)) {
      keySource = '사용자 설정';
    }

    return {
      hasApiKey,
      keySource,
      configExists: fs.existsSync(this.envFile),
      configPath: this.envFile
    };
  }

  /**
   * 사용자 설정 메뉴
   */
  async showConfigMenu() {
    console.clear();
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.blue('⚙️ 설정 관리'));
    console.log(chalk.blue('─────────────────────────────────────────────'));
    
    // Git 상태 정보 표시
    try {
      const executor = require('./executor');
      const gitStatus = await executor.getGitStatus();
      executor.displayGitStatus(gitStatus);
      console.log(chalk.blue('─────────────────────────────────────────────'));
    } catch (error) {
      // Git 상태 확인 실패 시 무시
    }
    
    // 현재 설정 상태를 상단에 표시
    const status = this.checkConfigStatus();
    console.log(chalk.blue('\n📋 현재 설정 상태:'));
    
    if (status.hasApiKey) {
      console.log(chalk.green('✅ API 키가 등록되어 있습니다.'));
    } else {
      console.log(chalk.red('❌ API 키가 설정되지 않았습니다'));
    }

    console.log(chalk.gray('\n📍 설정 파일 위치:'));
    console.log(chalk.gray(`📁 ${status.configPath} ${status.configExists ? '✅' : '❌'}`));
    
    // 메뉴 선택지 구성 (조건부)
    const choices = [];
    
    if (status.hasApiKey) {
      choices.push({ name: '🔑 API 키 수정', value: 'setApiKey' });
    } else {
      choices.push({ name: '🔑 API 키 설정', value: 'setApiKey' });
    }
    
    choices.push(
      { name: '🗑️  API 키 삭제', value: 'deleteApiKey' },
      { name: '🔄 설정 초기화', value: 'reset' },
      { name: '↩️  메인 메뉴로 돌아가기', value: 'back' }
    );

    const { selection: action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: '\n설정 메뉴 - 무엇을 하시겠습니까?',
        choices,
        prefix: '',
        suffix: ''
      }
    ]);

    switch (action) {
      case 'setApiKey':
        await this.promptForApiKey();
        break;
      case 'deleteApiKey':
        await this.deleteApiKey();
        break;
      case 'reset':
        await this.resetConfig();
        break;
      case 'back':
        console.log(chalk.blue('\n─────────────────────────────────────────────'));
        return false; // 메인 메뉴로 돌아가기
    }

    return true; // 설정 메뉴 계속
  }

  /**
   * 설정 초기화 (모든 설정 파일 삭제)
   */
  async resetConfig() {
    console.clear();
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.blue('🔄 설정 초기화'));
    console.log(chalk.blue('─────────────────────────────────────────────'));

    const { selection: confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'selection',
        message: '정말로 모든 설정을 초기화하시겠습니까? (복구할 수 없습니다)',
        default: false,
        prefix: '',
        suffix: ''
      }
    ]);

    if (!confirm) {
      console.log(chalk.blue('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('취소되었습니다.'));
      console.log(chalk.blue('─────────────────────────────────────────────'));
      return;
    }

    try {
      // 설정 파일들 삭제
      if (fs.existsSync(this.envFile)) {
        fs.unlinkSync(this.envFile);
        console.log(chalk.green('✅ API 키 설정이 삭제되었습니다.'));
      }
      if (fs.existsSync(this.configFile)) {
        fs.unlinkSync(this.configFile);
        console.log(chalk.green('✅ 설정 파일이 삭제되었습니다.'));
      }

      // 환경변수에서도 제거
      if (process.env.GEMINI_API_KEY) {
        delete process.env.GEMINI_API_KEY;
      }

      console.log(chalk.blue('\n─────────────────────────────────────────────'));
      console.log(chalk.green('✅ 설정 초기화가 완료되었습니다.'));
      console.log(chalk.blue('─────────────────────────────────────────────'));
    } catch (error) {
      console.log(chalk.blue('\n─────────────────────────────────────────────'));
      console.error(chalk.red(`❌ 설정 초기화 실패: ${error.message}`));
      console.log(chalk.blue('─────────────────────────────────────────────'));
    }
  }

  /**
   * API 키 자동 설정 (키가 없을 때)
   */
  async ensureApiKey() {
    const apiKey = this.getApiKey();
    if (apiKey) {
      return apiKey;
    }

    console.clear();
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.yellow('⚠️ Gemini API 키가 설정되지 않았습니다.'));
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.gray('rltgjqm을 사용하려면 Google Gemini API 키가 필요합니다.\n'));

    const { selection: action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: '어떻게 하시겠습니까?',
        choices: [
          { name: '🔑 지금 API 키 설정하기', value: 'setup' },
          { name: '📖 API 키 발급 방법 보기', value: 'help' },
          { name: '❌ 종료', value: 'exit' }
        ],
        prefix: '',
        suffix: ''
      }
    ]);

    switch (action) {
      case 'setup':
        const success = await this.promptForApiKey();
        return success ? this.getApiKey() : null;
      case 'help':
        this.showApiKeyHelp();
        return await this.ensureApiKey(); // 다시 물어보기
      case 'exit':
        console.log(chalk.blue('\n─────────────────────────────────────────────'));
        console.log(chalk.gray('👋 설정을 완료한 후 다시 시도해주세요.'));
        console.log(chalk.blue('─────────────────────────────────────────────'));
        process.exit(0);
    }
  }

  /**
   * API 키 발급 도움말
   */
  showApiKeyHelp() {
    console.clear();
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.blue('📖 Gemini API 키 발급 방법'));
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.gray('1. https://ai.google.dev/ 접속'));
    console.log(chalk.gray('2. "Get API key" 클릭'));
    console.log(chalk.gray('3. Google 계정으로 로그인'));
    console.log(chalk.gray('4. "Create API key" 버튼 클릭'));
    console.log(chalk.gray('5. 생성된 API 키 복사'));
    console.log(chalk.gray('6. rltgjqm에서 해당 키 입력\n'));
    console.log(chalk.blue('─────────────────────────────────────────────'));
  }

  /**
   * API 키 삭제 (.env 파일 삭제)
   */
  async deleteApiKey() {
    const status = this.checkConfigStatus();
    
    if (!status.hasApiKey) {
      console.log(chalk.blue('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('⚠️  설정된 API 키가 없습니다.'));
      console.log(chalk.blue('─────────────────────────────────────────────'));
      return;
    }

    console.clear();
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.blue('🗑️ API 키 삭제'));
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.gray(`삭제할 파일: ${status.configPath}\n`));

    // 확인 메시지
    const { selection: confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'selection',
        message: '정말로 API 키를 삭제하시겠습니까? (복구할 수 없습니다)',
        default: false,
        prefix: '',
        suffix: ''
      }
    ]);

    if (!confirm) {
      console.log(chalk.blue('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('취소되었습니다.'));
      console.log(chalk.blue('─────────────────────────────────────────────'));
      return;
    }

    try {
      if (fs.existsSync(this.envFile)) {
        fs.unlinkSync(this.envFile);
        console.log(chalk.green('✅ API 키 파일이 삭제되었습니다.'));
        
        // 환경변수에서도 제거
        if (process.env.GEMINI_API_KEY) {
          delete process.env.GEMINI_API_KEY;
        }
        
        console.log(chalk.blue('\n─────────────────────────────────────────────'));
        console.log(chalk.green('✅ API 키가 성공적으로 삭제되었습니다.'));
        console.log(chalk.blue('─────────────────────────────────────────────'));
      } else {
        console.log(chalk.blue('\n─────────────────────────────────────────────'));
        console.log(chalk.yellow('⚠️  삭제할 파일이 없습니다.'));
        console.log(chalk.blue('─────────────────────────────────────────────'));
      }
    } catch (error) {
      console.log(chalk.blue('\n─────────────────────────────────────────────'));
      console.error(chalk.red(`❌ API 키 삭제 실패: ${error.message}`));
      console.log(chalk.blue('─────────────────────────────────────────────'));
    }
  }
}

module.exports = new ConfigManager(); 