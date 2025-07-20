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
   * AI 설정 가져오기 (플랫폼과 API 키)
   */
  getAIConfig() {
    // 1. 환경변수에서 확인 (기존 방식 호환)
    if (process.env.GEMINI_API_KEY) {
      return {
        provider: 'gemini',
        apiKey: process.env.GEMINI_API_KEY
      };
    }
    
    if (process.env.OPENAI_API_KEY) {
      return {
        provider: 'chatgpt', 
        apiKey: process.env.OPENAI_API_KEY
      };
    }

    // 2. 사용자 설정 파일에서 확인
    return this.readConfigFile();
  }

  /**
   * 설정 파일에서 AI 설정 읽기
   */
  readConfigFile() {
    try {
      if (fs.existsSync(this.configFile)) {
        const content = fs.readFileSync(this.configFile, 'utf-8');
        const config = JSON.parse(content);
        
        // 새로운 멀티 플랫폼 형태 확인
        if (config.platforms) {
          return {
            provider: config.currentProvider || null,
            apiKey: config.platforms[config.currentProvider]?.apiKey || null,
            platforms: config.platforms
          };
        }
        
        // 기존 단일 플랫폼 형태 (하위 호환성)
        return {
          provider: config.aiProvider || null,
          apiKey: config.apiKey || null
        };
      }
    } catch (error) {
      // 설정 파일 읽기 실패 시 기본값 반환
    }

    // 기존 .env 파일도 확인 (하위 호환성)
    const legacyKey = this.readEnvFile(this.envFile);
    if (legacyKey) {
      return {
        provider: 'gemini',
        apiKey: legacyKey
      };
    }

    return { provider: null, apiKey: null };
  }

  /**
   * 전체 설정 읽기 (멀티 플랫폼 지원)
   */
  readFullConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const content = fs.readFileSync(this.configFile, 'utf-8');
        const config = JSON.parse(content);
        
        // 새로운 멀티 플랫폼 형태로 변환
        if (!config.platforms) {
          // 기존 설정을 새 형태로 마이그레이션
          const migratedConfig = {
            currentProvider: config.aiProvider || null,
            platforms: {},
            lastUpdated: new Date().toISOString()
          };
          
          if (config.aiProvider && config.apiKey) {
            migratedConfig.platforms[config.aiProvider] = {
              apiKey: config.apiKey,
              lastUpdated: config.lastUpdated || new Date().toISOString()
            };
          }
          
          return migratedConfig;
        }
        
        return config;
      }
    } catch (error) {
      console.error('설정 파일 읽기 오류:', error.message);
    }

    return {
      currentProvider: null,
      platforms: {},
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 전체 설정 저장 (멀티 플랫폼 지원)
   */
  saveFullConfig(config) {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error(chalk.red(`❌ 설정 저장 실패: ${error.message}`));
      return false;
    }
  }

  /**
   * 특정 플랫폼의 API 키 설정
   */
  async setPlatformApiKey(provider, apiKey) {
    const config = this.readFullConfig();
    
    if (!config.platforms) {
      config.platforms = {};
    }
    
    config.platforms[provider] = {
      apiKey: apiKey,
      lastUpdated: new Date().toISOString()
    };
    
    // 현재 활성 플랫폼이 없으면 이 플랫폼으로 설정
    if (!config.currentProvider) {
      config.currentProvider = provider;
    }
    
    config.lastUpdated = new Date().toISOString();
    
    const success = this.saveFullConfig(config);
    if (success) {
      console.log(chalk.green(`✅ ${this.getPlatformName(provider)} API 키가 저장되었습니다.`));
      
      // 기존 .env 파일이 있으면 삭제 (마이그레이션)
      if (fs.existsSync(this.envFile)) {
        fs.unlinkSync(this.envFile);
        console.log(chalk.yellow('📄 기존 .env 파일을 새로운 설정 파일로 마이그레이션했습니다.'));
      }
    }
    
    return success;
  }

  /**
   * 특정 플랫폼의 API 키 삭제
   */
  async deletePlatformApiKey(provider) {
    const config = this.readFullConfig();
    
    if (!config.platforms || !config.platforms[provider]) {
      console.log(chalk.yellow(`⚠️  ${this.getPlatformName(provider)} API 키가 설정되어 있지 않습니다.`));
      return false;
    }
    
    delete config.platforms[provider];
    
    // 삭제된 플랫폼이 현재 활성 플랫폼이면 다른 플랫폼으로 변경
    if (config.currentProvider === provider) {
      const availablePlatforms = Object.keys(config.platforms);
      config.currentProvider = availablePlatforms.length > 0 ? availablePlatforms[0] : null;
    }
    
    config.lastUpdated = new Date().toISOString();
    
    const success = this.saveFullConfig(config);
    if (success) {
      console.log(chalk.green(`✅ ${this.getPlatformName(provider)} API 키가 삭제되었습니다.`));
    }
    
    return success;
  }

  /**
   * 현재 활성 플랫폼 변경
   */
  async setCurrentProvider(provider) {
    const config = this.readFullConfig();
    
    if (!config.platforms || !config.platforms[provider]) {
      console.log(chalk.red(`❌ ${this.getPlatformName(provider)} API 키가 설정되어 있지 않습니다.`));
      return false;
    }
    
    config.currentProvider = provider;
    config.lastUpdated = new Date().toISOString();
    
    const success = this.saveFullConfig(config);
    if (success) {
      console.log(chalk.green(`✅ 활성 AI 플랫폼이 ${this.getPlatformName(provider)}으로 변경되었습니다.`));
    }
    
    return success;
  }

  /**
   * 플랫폼명 반환
   */
  getPlatformName(provider) {
    const platformNames = {
      'chatgpt': 'ChatGPT (OpenAI)',
      'gemini': 'Gemini (Google)'
    };
    return platformNames[provider] || provider;
  }

  /**
   * AI 설정 저장 (플랫폼과 API 키)
   */
  async setAIConfig(provider, apiKey) {
    const config = {
      aiProvider: provider,
      apiKey: apiKey,
      lastUpdated: new Date().toISOString()
    };

    try {
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2), 'utf-8');
      console.log(chalk.green(`✅ AI 설정이 저장되었습니다: ${this.configFile}`));
      
      // 기존 .env 파일이 있으면 삭제 (마이그레이션)
      if (fs.existsSync(this.envFile)) {
        fs.unlinkSync(this.envFile);
        console.log(chalk.yellow('📄 기존 .env 파일을 새로운 설정 파일로 마이그레이션했습니다.'));
      }
      
      return true;
    } catch (error) {
      console.error(chalk.red(`❌ AI 설정 저장 실패: ${error.message}`));
      return false;
    }
  }

  /**
   * 플랫폼별 설정 메뉴
   */
  async showPlatformMenu(provider) {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white(`⚙️ ${this.getPlatformName(provider)} 설정`));
    console.log(chalk.white('─────────────────────────────────────────────'));
    
    const config = this.readFullConfig();
    const hasApiKey = config.platforms && config.platforms[provider];
    const isCurrentProvider = config.currentProvider === provider;
    
    console.log(chalk.white('📋 현재 상태:'));
    if (hasApiKey) {
      console.log(chalk.green(`✅ API 키: 설정됨`));
      console.log(chalk.white(`   마지막 업데이트: ${config.platforms[provider].lastUpdated.split('T')[0]}`));
      if (isCurrentProvider) {
        console.log(chalk.green('✅ 현재 활성 플랫폼'));
      } else {
        console.log(chalk.white('   현재 비활성 상태'));
      }
    } else {
      console.log(chalk.red('❌ API 키: 설정되지 않음'));
    }
    
    const apiUrls = {
      'chatgpt': 'https://platform.openai.com/api-keys',
      'gemini': 'https://ai.google.dev/'
    };
    
    console.log(chalk.white(`\n🔗 API 키 발급: ${apiUrls[provider]}`));
    
    // 메뉴 선택지 구성
    const choices = [];
    
    if (hasApiKey) {
      choices.push({ name: '✏️  API 키 수정', value: 'modify' });
      if (!isCurrentProvider) {
        choices.push({ name: '🎯 이 플랫폼으로 전환', value: 'activate' });
      }
      choices.push({ name: '🗑️  API 키 삭제', value: 'delete' });
    } else {
      choices.push({ name: '➕ API 키 추가', value: 'add' });
    }
    
    choices.push({ name: '↩️  이전 메뉴로', value: 'back' });

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '\n무엇을 하시겠습니까?',
        choices,
        prefix: '',
        suffix: ''
      }
    ]);

    switch (action) {
      case 'add':
      case 'modify':
        await this.promptForPlatformApiKey(provider);
        break;
      case 'delete':
        await this.confirmDeletePlatformApiKey(provider);
        break;
      case 'activate':
        await this.setCurrentProvider(provider);
        await this.showPlatformMenu(provider); // 상태 업데이트 후 다시 표시
        return;
      case 'back':
        return;
    }

    // 작업 완료 후 메뉴 다시 표시
    console.log(chalk.white('\n계속하려면 Enter를 누르세요...'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
    await this.showPlatformMenu(provider);
  }

  /**
   * 플랫폼별 API 키 입력
   */
  async promptForPlatformApiKey(provider) {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white(`🔑 ${this.getPlatformName(provider)} API 키 설정`));
    console.log(chalk.white('─────────────────────────────────────────────'));
    
    const apiUrls = {
      'chatgpt': 'https://platform.openai.com/api-keys',
      'gemini': 'https://ai.google.dev/'
    };
    
    console.log(chalk.white(`API 키는 ${apiUrls[provider]} 에서 발급받을 수 있습니다.`));
    console.log(chalk.white('저장 위치:'), chalk.greenBright(`${this.configFile}\n`));
    console.log(chalk.white('취소하려면 "cancel" 또는 "exit"를 입력하세요.'));

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: `${this.getPlatformName(provider)} API 키를 입력하세요:`,
        mask: '*',
        validate: (input) => {
          // 입력 최적화: 빈 값일 때만 즉시 체크
          if (input === '') {
            return 'API 키를 입력해주세요.';
          }
          if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'exit') {
            return true;
          }
          if (input.length > 0 && input.length < 10) {
            return 'API 키가 너무 짧습니다. 올바른 API 키를 입력하세요.';
          }
          return true;
        },
        prefix: '',
        suffix: ''
      }
    ]);

    // 취소 확인
    if (apiKey.toLowerCase() === 'cancel' || apiKey.toLowerCase() === 'exit') {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('설정이 취소되었습니다.'));
      console.log(chalk.white('─────────────────────────────────────────────'));
      return false;
    }

    // API 키 유효성 검사
    console.log(chalk.white('\n🔍 API 키 유효성 검사 중...'));
    
    const aiService = require('./aiService');
    const isValid = await aiService.validateApiKey(provider, apiKey);
    
    if (!isValid) {
      console.log(chalk.red('\n❌ API 키 유효성 검사에 실패했습니다.'));
      console.log(chalk.yellow('다시 시도하시겠습니까?'));
      
      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: '다시 시도하시겠습니까?',
          default: true,
          prefix: '',
          suffix: ''
        }
      ]);
      
      if (retry) {
        return await this.promptForPlatformApiKey(provider);
      } else {
        return false;
      }
    }

    // 설정 저장
    const success = await this.setPlatformApiKey(provider, apiKey);
    
    if (success) {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.green(`✅ ${this.getPlatformName(provider)} 설정이 완료되었습니다!`));
      console.log(chalk.white('─────────────────────────────────────────────'));
    }
    
    return success;
  }

  /**
   * 플랫폼 API 키 삭제 확인
   */
  async confirmDeletePlatformApiKey(provider) {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.red(`🗑️ ${this.getPlatformName(provider)} API 키 삭제`));
    console.log(chalk.white('─────────────────────────────────────────────'));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `정말로 ${this.getPlatformName(provider)} API 키를 삭제하시겠습니까?`,
        default: false,
        prefix: '',
        suffix: ''
      }
    ]);

    if (!confirm) {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('취소되었습니다.'));
      console.log(chalk.white('─────────────────────────────────────────────'));
      return false;
    }

    const success = await this.deletePlatformApiKey(provider);
    
    if (success) {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
    }
    
    return success;
  }

  /**
   * 대화형 AI 플랫폼 선택 및 API 키 설정
   */
  async promptForAISetup() {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('           🤖 AI 플랫폼 선택 및 설정'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('rltgjqm은 다음 AI 플랫폼을 지원합니다:\n'));
    
    console.log(chalk.cyan('📌 ChatGPT (OpenAI)'));
    console.log(chalk.white('   • 모델: gpt-4o-mini'));
    console.log(chalk.white('   • API 키: https://platform.openai.com/api-keys\n'));
    
    console.log(chalk.cyan('📌 Gemini (Google)'));
    console.log(chalk.white('   • 모델: gemini-1.5-flash'));
    console.log(chalk.white('   • API 키: https://ai.google.dev/\n'));

    // 1단계: AI 플랫폼 선택
    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'AI 플랫폼을 선택하세요:',
        choices: [
          { name: '🤖 ChatGPT (OpenAI)', value: 'chatgpt' },
          { name: '🧠 Gemini (Google)', value: 'gemini' },
          { name: '❌ 취소', value: 'cancel' }
        ],
        prefix: '',
        suffix: ''
      }
    ]);

    if (provider === 'cancel') {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('설정이 취소되었습니다.'));
      console.log(chalk.white('─────────────────────────────────────────────'));
      return false;
    }

    // 2단계: API 키 입력
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    
    const platformNames = {
      'chatgpt': 'ChatGPT (OpenAI)',
      'gemini': 'Gemini (Google)'
    };
    
    const apiUrls = {
      'chatgpt': 'https://platform.openai.com/api-keys',
      'gemini': 'https://ai.google.dev/'
    };

    console.log(chalk.white(`            🔑 ${platformNames[provider]} API 키 설정`));
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white(`API 키는 ${apiUrls[provider]} 에서 발급받을 수 있습니다.`));
    console.log(chalk.white('저장 위치:'), chalk.greenBright(`${this.configFile}\n`));
    console.log(chalk.white('취소하려면 "cancel" 또는 "exit"를 입력하세요.'));

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: `${platformNames[provider]} API 키를 입력하세요:`,
        mask: '*',
        validate: (input) => {
          if (!input) {
            return 'API 키를 입력해주세요.';
          }
          if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'exit') {
            return true;
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

    // 취소 확인
    if (apiKey.toLowerCase() === 'cancel' || apiKey.toLowerCase() === 'exit') {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('설정이 취소되었습니다.'));
      console.log(chalk.white('─────────────────────────────────────────────'));
      return false;
    }

    // 3단계: API 키 유효성 검사
    console.log(chalk.white('\n🔍 API 키 유효성 검사 중...'));
    
    const aiService = require('./aiService');
    const isValid = await aiService.validateApiKey(provider, apiKey);
    
    if (!isValid) {
      console.log(chalk.red('\n❌ API 키 유효성 검사에 실패했습니다.'));
      console.log(chalk.yellow('다시 시도하시겠습니까?'));
      
      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: '다시 시도하시겠습니까?',
          default: true,
          prefix: '',
          suffix: ''
        }
      ]);
      
      if (retry) {
        return await this.promptForAISetup(); // 재시도
      } else {
        return false;
      }
    }

    // 4단계: 설정 저장
    const success = await this.setAIConfig(provider, apiKey);
    
    if (success) {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.green(`✅ ${platformNames[provider]} 설정이 완료되었습니다!`));
      console.log(chalk.white('─────────────────────────────────────────────'));
    }
    
    return success;
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
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('            🔑 Gemini API 키 설정'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('API 키는 https://ai.google.dev/ 에서 발급받을 수 있습니다.'));

    // 현재 경로 정보 표시
    console.log(chalk.white('저장 위치:'), chalk.greenBright(`${this.envFile}\n`));
    console.log(chalk.white('취소하려면 "cancel" 또는 "exit"를 입력하세요.'));

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
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('취소되었습니다.'));
      console.log(chalk.white('─────────────────────────────────────────────'));
      return false;
    }

    const success = await this.setApiKey(answers.apiKey);
    
    if (success) {
      // 환경변수에도 설정 (현재 세션용)
      process.env.GEMINI_API_KEY = answers.apiKey;
      console.log(chalk.white('\n─────────────────────────────────────────────'));
    }
    return success;
  }

  /**
   * AI 설정 상태 확인
   */
  checkConfigStatus() {
    const { provider, apiKey } = this.getAIConfig();
    const hasApiKey = !!(provider && apiKey);
    
    let keySource = '';
    let configPath = this.configFile;
    
    if (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) {
      keySource = '환경변수';
    } else if (fs.existsSync(this.configFile)) {
      keySource = '사용자 설정 (JSON)';
    } else if (this.readEnvFile(this.envFile)) {
      keySource = '기존 설정 (.env)';
      configPath = this.envFile;
    }

    return {
      hasApiKey,
      provider,
      keySource,
      configExists: fs.existsSync(configPath),
      configPath
    };
  }

  /**
   * 사용자 설정 메뉴
   */
  async showConfigMenu() {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('⚙️ 설정 관리'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    
    // Git 상태 정보 표시
    try {
      const executor = require('./executor');
      const gitStatus = await executor.getGitStatus();
      executor.displayGitStatus(gitStatus);
      console.log(chalk.white('─────────────────────────────────────────────'));
    } catch (error) {
      // Git 상태 확인 실패 시 무시
    }
    
    // 현재 설정 상태를 상단에 표시
    const status = this.checkConfigStatus();
    const fullConfig = this.readFullConfig();
    
    // AI 플랫폼 설정 상태 표시 (통합된 정보)
    if (fullConfig.platforms && Object.keys(fullConfig.platforms).length > 0) {
      console.log(chalk.white('\n📱 등록된 AI 플랫폼:'));
      Object.keys(fullConfig.platforms).forEach(platform => {
        const isActive = fullConfig.currentProvider === platform;
        const statusIcon = isActive ? chalk.green('🎯 활성') : chalk.white('   비활성');
        console.log(`${statusIcon} ${this.getPlatformName(platform)}`);
      });
      console.log(chalk.white(`   키 소스: ${status.keySource}`));
    } else {
      console.log(chalk.white('\n📱 등록된 AI 플랫폼:'));
      console.log(chalk.red('❌ 설정된 AI 플랫폼이 없습니다'));
    }

    // 기본 실행 모드 정보 표시
    const currentMode = this.getDefaultExecutionMode();
    const modeNames = {
      'auto': '🚀 자동 실행',
      'interactive': '🔍 단계별 확인',
      'dry': '👀 미리보기'
    };
    console.log(chalk.white('\n⚙️ 기본 실행 모드:'));
    if (currentMode) {
      console.log(chalk.green(`✅ ${modeNames[currentMode]}`));
    } else {
      console.log(chalk.red('❌ 설정되지 않음'));
    }

    // 출력 모드 정보 표시
    const currentOutputMode = this.getOutputMode();
    const outputModeNames = {
      'detail': '📄 상세 출력',
      'simple': '📝 간단 출력'
    };
    console.log(chalk.white('\n📋 출력 모드:'));
    console.log(chalk.green(`✅ ${outputModeNames[currentOutputMode]}`));

    // 프롬프트 디버그 모드 정보 표시
    const debugMode = this.getDebugMode();
    console.log(chalk.white('\n🔍 프롬프트 표시:'));
    console.log(debugMode ? chalk.green('✅ 활성화') : chalk.white('❌ 비활성화'));

    console.log(chalk.white('\n📍 설정 파일 위치:'));
    console.log(chalk.white(`📁 ${status.configPath} ${status.configExists ? '✅' : '❌'}`));
    
    // 메뉴 선택지 구성
    const choices = [];
    
    // 1. 활성 플랫폼 전환 (등록된 플랫폼이 2개 이상일 때만)
    const registeredPlatforms = Object.keys(fullConfig.platforms || {});
    if (registeredPlatforms.length > 1) {
      choices.push({ name: '🎯 활성 AI 플랫폼 전환', value: 'selectPlatform' });
    }

    // 2. 출력 모드 변경
    choices.push({ name: '📋 출력 모드 변경', value: 'outputMode' });

    // 3. 프롬프트 디버그 모드 변경
    choices.push({ name: '🔍 프롬프트 표시', value: 'debugMode' });
    
    // 2. 플랫폼별 설정 관리
    const hasGemini = fullConfig.platforms && fullConfig.platforms['gemini'];
    const hasChatGPT = fullConfig.platforms && fullConfig.platforms['chatgpt'];
    
    if (hasGemini) {
      choices.push({ name: '⚙️  Gemini 설정 관리', value: 'geminiSettings' });
    } else {
      choices.push({ name: chalk.red('➕ Gemini API Key 추가'), value: 'geminiAdd' });
    }
    
    if (hasChatGPT) {
      choices.push({ name: '⚙️  ChatGPT 설정 관리', value: 'chatgptSettings' });
    } else {
      choices.push({ name: chalk.red('➕ ChatGPT API Key 추가'), value: 'chatgptAdd' });
    }
    
    // 3. 고급 옵션
    if (registeredPlatforms.length > 0) {
      choices.push({ name: '🗑️  모든 API Key 삭제', value: 'deleteApiKey' });
    }
    
    choices.push(
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
      case 'selectPlatform':
        await this.showPlatformSelectMenu();
        break;
      case 'geminiSettings':
        await this.showPlatformMenu('gemini');
        break;
      case 'chatgptSettings':
        await this.showPlatformMenu('chatgpt');
        break;
      case 'geminiAdd':
        await this.promptForPlatformApiKey('gemini');
        break;
      case 'chatgptAdd':
        await this.promptForPlatformApiKey('chatgpt');
        break;
      case 'deleteApiKey':
        await this.deleteApiKey();
        break;
      case 'outputMode':
        await this.showOutputModeMenu();
        break;
             case 'debugMode':
         await this.setDebugMode(!this.getDebugMode());
         await this.showConfigMenu();
         break;
      case 'back':
        console.log(chalk.white('\n─────────────────────────────────────────────'));
        return false; // 메인 메뉴로 돌아가기
    }

    return true; // 설정 메뉴 계속
  }

  /**
   * AI 플랫폼 선택 메뉴
   */
  async showPlatformSelectMenu() {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('🤖 AI 플랫폼 선택'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    
    const fullConfig = this.readFullConfig();
    const availablePlatforms = Object.keys(fullConfig.platforms || {});
    
    console.log(chalk.white('📋 현재 상태:'));
    if (fullConfig.currentProvider) {
      console.log(chalk.green(`✅ 활성 플랫폼: ${this.getPlatformName(fullConfig.currentProvider)}`));
    } else {
      console.log(chalk.red('❌ 활성 플랫폼 없음'));
    }
    
    if (availablePlatforms.length === 0) {
      console.log(chalk.red('\n❌ 등록된 AI 플랫폼이 없습니다.'));
      console.log(chalk.white('먼저 AI 플랫폼을 설정해주세요.'));
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '\n무엇을 하시겠습니까?',
          choices: [
            { name: '➕ AI 플랫폼 설정하기', value: 'setup' },
            { name: '↩️  이전 메뉴로', value: 'back' }
          ],
          prefix: '',
          suffix: ''
        }
      ]);
      
      if (action === 'setup') {
        await this.promptForAISetup();
      }
      return;
    }
    
    console.log(chalk.white('\n📱 등록된 플랫폼:'));
    availablePlatforms.forEach(platform => {
      const isActive = fullConfig.currentProvider === platform;
      const status = isActive ? chalk.green('🎯 활성') : chalk.white('   비활성');
      console.log(`${status} ${this.getPlatformName(platform)}`);
    });
    
    const choices = availablePlatforms.map(platform => ({
      name: `${fullConfig.currentProvider === platform ? '🎯' : '  '} ${this.getPlatformName(platform)}`,
      value: platform
    }));
    
    choices.push({ name: '↩️  이전 메뉴로', value: 'back' });

    const { selectedPlatform } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedPlatform',
        message: '\n사용할 AI 플랫폼을 선택하세요:',
        choices,
        prefix: '',
        suffix: ''
      }
    ]);

    if (selectedPlatform === 'back') {
      return;
    }

    if (selectedPlatform !== fullConfig.currentProvider) {
      await this.setCurrentProvider(selectedPlatform);
      console.log(chalk.white('\n계속하려면 Enter를 누르세요...'));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
    } else {
      console.log(chalk.yellow(`\n이미 ${this.getPlatformName(selectedPlatform)}이(가) 활성 플랫폼입니다.`));
      console.log(chalk.white('\n계속하려면 Enter를 누르세요...'));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
    }
  }

  /**
   * API 사용량 추적 설정 메뉴
   */
  async showUsageSettings() {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('📊 API 사용량 추적 설정'));
    console.log(chalk.white('─────────────────────────────────────────────'));

    // 사용량 파일 확인
    const usageFile = path.join(this.configDir, 'usage.json');
    const hasUsageData = fs.existsSync(usageFile);
    
    if (hasUsageData) {
      try {
        const usageData = JSON.parse(fs.readFileSync(usageFile, 'utf-8'));
        console.log(chalk.white('📋 현재 상태:'));
        console.log(chalk.green(`✅ 사용량 데이터: 존재함`));
        console.log(chalk.white(`   마지막 업데이트: ${usageData.lastReset || '알 수 없음'}`));
        
        if (usageData.chatgpt) {
          console.log(chalk.white(`   ChatGPT 토큰: ${usageData.chatgpt.tokens || 0}`));
          console.log(chalk.white(`   ChatGPT 요청: ${usageData.chatgpt.requests || 0}`));
        }
        
        if (usageData.gemini) {
          console.log(chalk.white(`   Gemini 토큰: ${usageData.gemini.tokens || 0}`));
          console.log(chalk.white(`   Gemini 요청: ${usageData.gemini.requests || 0}`));
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  사용량 데이터 읽기 오류: ${error.message}`));
      }
    } else {
      console.log(chalk.white('📋 현재 상태:'));
      console.log(chalk.red('❌ 사용량 데이터: 없음'));
    }

    console.log(chalk.white(`\n📁 사용량 파일: ${usageFile}`));

    // 메뉴 선택지
    const choices = [];
    
    if (hasUsageData) {
      choices.push({ name: '📊 사용량 데이터 보기', value: 'view' });
      choices.push({ name: '🔄 사용량 데이터 초기화', value: 'reset' });
      choices.push({ name: '🗑️  사용량 데이터 삭제', value: 'delete' });
    } else {
      choices.push({ name: '📋 사용량 데이터가 없습니다', value: 'none' });
    }
    
    choices.push({ name: '↩️  이전 메뉴로', value: 'back' });

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '\n무엇을 하시겠습니까?',
        choices,
        prefix: '',
        suffix: ''
      }
    ]);

    switch (action) {
      case 'view':
        await this.viewUsageData(usageFile);
        break;
      case 'reset':
        await this.resetUsageData(usageFile);
        break;
      case 'delete':
        await this.deleteUsageData(usageFile);
        break;
      case 'none':
        console.log(chalk.yellow('\n💡 API를 사용하면 자동으로 사용량 데이터가 생성됩니다.'));
        console.log(chalk.white('계속하려면 Enter를 누르세요...'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
        break;
      case 'back':
        return;
    }

    // 작업 완료 후 메뉴 다시 표시 (back 제외)
    if (action !== 'back') {
      console.log(chalk.white('\n계속하려면 Enter를 누르세요...'));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
      await this.showUsageSettings();
    }
  }

  /**
   * 사용량 데이터 상세 보기
   */
  async viewUsageData(usageFile) {
    try {
      const usageData = JSON.parse(fs.readFileSync(usageFile, 'utf-8'));
      
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.white('📊 상세 사용량 정보'));
      console.log(chalk.white('─────────────────────────────────────────────'));
      
      console.log(chalk.white(`📅 기준 날짜: ${usageData.date || '알 수 없음'}`));
      console.log(chalk.white(`🔄 마지막 리셋: ${usageData.lastReset || '알 수 없음'}`));
      
      // ChatGPT 사용량
      if (usageData.chatgpt) {
        console.log(chalk.cyan('\n🤖 ChatGPT (OpenAI):'));
        console.log(chalk.white(`   토큰 사용량: ${usageData.chatgpt.tokens?.toLocaleString() || 0}`));
        console.log(chalk.white(`   API 요청 수: ${usageData.chatgpt.requests?.toLocaleString() || 0}`));
      }
      
      // Gemini 사용량
      if (usageData.gemini) {
        console.log(chalk.cyan('\n🧠 Gemini (Google):'));
        console.log(chalk.white(`   토큰 사용량: ${usageData.gemini.tokens?.toLocaleString() || 0}`));
        console.log(chalk.white(`   API 요청 수: ${usageData.gemini.requests?.toLocaleString() || 0}`));
      }
      
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      
    } catch (error) {
      console.log(chalk.red(`\n❌ 사용량 데이터 읽기 실패: ${error.message}`));
    }
  }

  /**
   * 사용량 데이터 초기화 (0으로 리셋)
   */
  async resetUsageData(usageFile) {
    console.log(chalk.white('\n─────────────────────────────────────────────'));
    console.log(chalk.white('🔄 사용량 데이터 초기화'));
    console.log(chalk.white('─────────────────────────────────────────────'));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '사용량 데이터를 0으로 초기화하시겠습니까?',
        default: false,
        prefix: '',
        suffix: ''
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\n취소되었습니다.'));
      return;
    }

    try {
      const resetData = {
        date: new Date().toISOString().split('T')[0],
        lastReset: new Date().toISOString(),
        chatgpt: { tokens: 0, requests: 0 },
        gemini: { tokens: 0, requests: 0 }
      };

      fs.writeFileSync(usageFile, JSON.stringify(resetData, null, 2), 'utf-8');
      console.log(chalk.green('\n✅ 사용량 데이터가 초기화되었습니다.'));
      
    } catch (error) {
      console.log(chalk.red(`\n❌ 사용량 데이터 초기화 실패: ${error.message}`));
    }
  }

  /**
   * 사용량 데이터 완전 삭제
   */
  async deleteUsageData(usageFile) {
    console.log(chalk.white('\n─────────────────────────────────────────────'));
    console.log(chalk.red('🗑️ 사용량 데이터 삭제'));
    console.log(chalk.white('─────────────────────────────────────────────'));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '사용량 데이터를 완전히 삭제하시겠습니까? (복구할 수 없습니다)',
        default: false,
        prefix: '',
        suffix: ''
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\n취소되었습니다.'));
      return;
    }

    try {
      if (fs.existsSync(usageFile)) {
        fs.unlinkSync(usageFile);
        console.log(chalk.green('\n✅ 사용량 데이터 파일이 삭제되었습니다.'));
      } else {
        console.log(chalk.yellow('\n⚠️  삭제할 파일이 없습니다.'));
      }
      
    } catch (error) {
      console.log(chalk.red(`\n❌ 사용량 데이터 삭제 실패: ${error.message}`));
    }
  }

  /**
   * AI 설정 자동 확인 및 설정 안내
   */
  async ensureApiKey() {
    const { provider, apiKey } = this.getAIConfig();
    if (provider && apiKey) {
      return apiKey;
    }

    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.red('       ❌ AI 플랫폼이 설정되지 않았습니다.'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('rltgjqm을 사용하려면 AI API 키가 필요합니다.'));
    console.log(chalk.white('지원되는 플랫폼: ChatGPT, Gemini\n'));

    const { selection: action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: 'selection',
        choices: [
          { name: '🤖 AI 플랫폼 설정하기', value: 'setup' },
          { name: '❌ 종료', value: 'exit' }
        ],
        prefix: '',
        suffix: ''
      }
    ]);

    switch (action) {
      case 'setup':
        const success = await this.promptForAISetup();
        if (success) {
          const newConfig = this.getAIConfig();
          return newConfig.apiKey;
        }
        return null;
      case 'exit':
        console.log(chalk.white('\n─────────────────────────────────────────────'));
        console.log(chalk.white('👋 설정을 완료한 후 다시 시도해주세요.'));
        console.log(chalk.white('─────────────────────────────────────────────'));
        return null;
    }
  }

  /**
   * API 키 발급 도움말
   */
  showApiKeyHelp() {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('📖 Gemini API 키 발급 방법'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('1. https://ai.google.dev/ 접속'));
    console.log(chalk.white('2. "Get API key" 클릭'));
    console.log(chalk.white('3. Google 계정으로 로그인'));
    console.log(chalk.white('4. "Create API key" 버튼 클릭'));
    console.log(chalk.white('5. 생성된 API 키 복사'));
    console.log(chalk.white('6. rltgjqm에서 해당 키 입력\n'));
    console.log(chalk.white('─────────────────────────────────────────────'));
  }

  /**
   * 모든 API Key 삭제 (모든 플랫폼의 API 키 삭제)
   */
  async deleteApiKey() {
    const fullConfig = this.readFullConfig();
    const hasAnySettings = (fullConfig.platforms && Object.keys(fullConfig.platforms).length > 0) || 
                          fs.existsSync(this.envFile);
    
    if (!hasAnySettings) {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('⚠️  삭제할 API Key가 없습니다.'));
      console.log(chalk.white('─────────────────────────────────────────────'));
      return;
    }

    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('🗑️ 모든 API Key 삭제'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    
    if (fullConfig.platforms && Object.keys(fullConfig.platforms).length > 0) {
      console.log(chalk.red('삭제될 플랫폼:'));
      Object.keys(fullConfig.platforms).forEach(platform => {
        const isActive = fullConfig.currentProvider === platform;
        const status = isActive ? '🎯 활성' : '   비활성';
        console.log(chalk.white(`  ${status} ${this.getPlatformName(platform)}`));
      });
    }
    
    console.log(chalk.white(`\n📁 설정 파일: ${this.configFile}`));
    if (fs.existsSync(this.envFile)) {
      console.log(chalk.white(`📁 기존 설정: ${this.envFile}`));
    }

    // 확인 메시지
    const { selection: confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'selection',
        message: '정말로 모든 API Key를 삭제하시겠습니까? (복구할 수 없습니다)',
        default: false,
        prefix: '',
        suffix: ''
      }
    ]);

    if (!confirm) {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.yellow('취소되었습니다.'));
      console.log(chalk.white('─────────────────────────────────────────────'));
      return;
    }

    try {
      let deletedCount = 0;
      
      // 새로운 설정 파일 삭제
      if (fs.existsSync(this.configFile)) {
        fs.unlinkSync(this.configFile);
        console.log(chalk.green('✅ API Key 설정 파일이 삭제되었습니다.'));
        deletedCount++;
      }
      
      // 기존 .env 파일 삭제 (하위 호환성)
      if (fs.existsSync(this.envFile)) {
        fs.unlinkSync(this.envFile);
        console.log(chalk.green('✅ 기존 API Key 파일이 삭제되었습니다.'));
        deletedCount++;
      }

      // 환경변수에서도 제거
      if (process.env.GEMINI_API_KEY) {
        delete process.env.GEMINI_API_KEY;
      }
      if (process.env.OPENAI_API_KEY) {
        delete process.env.OPENAI_API_KEY;
      }
      
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      if (deletedCount > 0) {
        console.log(chalk.green('✅ 모든 API Key가 성공적으로 삭제되었습니다.'));
      } else {
        console.log(chalk.yellow('⚠️  삭제할 API Key 파일이 없었습니다.'));
      }
      console.log(chalk.white('─────────────────────────────────────────────'));
    } catch (error) {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.error(chalk.red(`❌ API Key 삭제 실패: ${error.message}`));
      console.log(chalk.white('─────────────────────────────────────────────'));
    }
  }

  /**
   * API 키 가져오기 (하위 호환성용)
   */
  getApiKey() {
    const { apiKey } = this.getAIConfig();
    return apiKey;
  }

  /**
   * 기본 실행 모드 가져오기
   */
  getDefaultExecutionMode() {
    const config = this.readFullConfig();
    return config.defaultExecutionMode || null;
  }

  /**
   * 기본 실행 모드 설정
   */
  async setDefaultExecutionMode(mode) {
    const config = this.readFullConfig();
    config.defaultExecutionMode = mode;
    config.lastUpdated = new Date().toISOString();
    
    const success = this.saveFullConfig(config);
    if (success) {
      const modeNames = {
        'auto': '자동 실행',
        'interactive': '단계별 확인', 
        'dry': '미리보기'
      };
      console.log(chalk.green(`✅ 기본 실행 모드가 '${modeNames[mode]}'으로 설정되었습니다.`));
    }
    
    return success;
  }

  /**
   * 최초 실행시 기본 모드 설정
   */
  async ensureDefaultExecutionMode() {
    const currentMode = this.getDefaultExecutionMode();
    if (currentMode) {
      return currentMode;
    }

    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('⚙️ 기본 실행 모드 설정'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('rltgjqm이 Git 명령어를 생성한 후 어떻게 처리할지 설정하세요.\n'));
    
    console.log(chalk.cyan('🚀 자동 실행 모드'));
    console.log(chalk.white('   생성된 명령어를 바로 실행합니다 (빠르지만 위험할 수 있음)'));
    console.log(chalk.white('   예: rltgjqm "커밋하고 푸시해줘" → 바로 실행\n'));
    
    console.log(chalk.cyan('🔍 단계별 확인 모드'));
    console.log(chalk.white('   각 명령어마다 실행 여부를 확인합니다 (안전함)'));
    console.log(chalk.white('   예: rltgjqm "브랜치 삭제해줘" → 각 단계마다 확인\n'));
    
    console.log(chalk.cyan('👀 미리보기 모드'));
    console.log(chalk.white('   명령어만 보여주고 실행하지 않습니다 (가장 안전함)'));
          console.log(chalk.white('   예: rltgjqm "새 브랜치 만들어줘" → 명령어만 출력\n'));

    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: '기본 실행 모드를 선택하세요:',
        choices: [
          { name: '🔍 단계별 확인 모드 (추천)', value: 'interactive' },
          { name: '👀 미리보기 모드 (가장 안전)', value: 'dry' },
          { name: '🚀 자동 실행 모드 (빠르지만 주의)', value: 'auto' }
        ],
        prefix: '',
        suffix: ''
      }
    ]);

    await this.setDefaultExecutionMode(mode);
    
    console.log(chalk.white('\n💡 언제든지 다음 방법으로 변경할 수 있습니다:'));
    console.log(chalk.cyan('   • rltgjqm config → 설정 메뉴'));
    console.log(chalk.cyan('   • rltgjqm -a (자동), -i (단계별), --dry (미리보기)'));
    
    console.log(chalk.white('\n─────────────────────────────────────────────'));
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: '계속하려면 Enter를 누르세요...',
        prefix: '',
        suffix: ''
      }
    ]);

    return mode;
  }

  /**
   * 기본 실행 모드 메뉴
   */
  async showExecutionModeMenu() {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('⚙️ 기본 실행 모드 설정'));
    console.log(chalk.white('─────────────────────────────────────────────'));

    const currentMode = this.getDefaultExecutionMode();
    const modeNames = {
      'auto': '🚀 자동 실행',
      'interactive': '🔍 단계별 확인',
      'dry': '👀 미리보기'
    };

    console.log(chalk.white('📋 현재 상태:'));
    if (currentMode) {
      console.log(chalk.green(`✅ ${modeNames[currentMode]}`));
    } else {
      console.log(chalk.red('❌ 설정되지 않음'));
    }

    const choices = [
      { name: '↩️  이전 메뉴로', value: 'back' }
    ];

    for (const [key, value] of Object.entries(modeNames)) {
      choices.push({ name: `${value} (${key})`, value: key });
    }

    const { selection: action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: '\n무엇을 하시겠습니까?',
        choices,
        prefix: '',
        suffix: ''
      }
    ]);

    if (action === 'back') {
      return;
    }

    await this.setDefaultExecutionMode(action);
    console.log(chalk.white('\n─────────────────────────────────────────────'));
    console.log(chalk.green(`✅ 기본 실행 모드가 '${modeNames[action]}'으로 변경되었습니다.`));
    console.log(chalk.white('─────────────────────────────────────────────'));
  }

  /**
   * 출력 모드 가져오기
   */
  getOutputMode() {
    const config = this.readFullConfig();
    return config.outputMode || 'detail'; // 기본값은 detail
  }

  /**
   * 출력 모드 설정
   */
  async setOutputMode(mode) {
    const config = this.readFullConfig();
    config.outputMode = mode;
    config.lastUpdated = new Date().toISOString();
    
    const success = this.saveFullConfig(config);
    if (success) {
      const modeNames = {
        'detail': '상세 출력',
        'simple': '간단 출력'
      };
      console.log(chalk.yellow(`✅ 출력 모드가 '${modeNames[mode]}'으로 설정되었습니다.`));
    }
    
    return success;
  }

  /**
   * 최초 실행시 출력 모드 설정
   */
  async ensureOutputMode() {
    const currentMode = this.getOutputMode();
    if (currentMode && currentMode !== 'detail') {
      return currentMode;
    }

    // 기본값은 detail 모드이므로 별도 설정 불필요
    return 'detail';
  }

  /**
   * 출력 모드 메뉴
   */
  async showOutputModeMenu() {
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('📋 출력 모드 변경'));
    console.log(chalk.white('─────────────────────────────────────────────'));

    const currentMode = this.getOutputMode();
    const modeNames = {
      'detail': '📄 상세 출력',
      'simple': '📝 간단 출력'
    };

    console.log(chalk.white('📋 현재 상태:'));
    if (currentMode) {
      console.log(chalk.green(`✅ ${modeNames[currentMode]}`));
    } else {
      console.log(chalk.red('❌ 설정되지 않음'));
    }

    const choices = [
      { name: '↩️  이전 메뉴로', value: 'back' }
    ];

    for (const [key, value] of Object.entries(modeNames)) {
      choices.push({ name: `${value} (${key})`, value: key });
    }

    const { selection: action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: '\n무엇을 하시겠습니까?',
        choices,
        prefix: '',
        suffix: ''
      }
    ]);

    if (action === 'back') {
      return;
    }

    await this.setOutputMode(action);
    console.log(chalk.white('\n─────────────────────────────────────────────'));
    console.log(chalk.green(`✅ 출력 모드가 '${modeNames[action]}'으로 변경되었습니다.`));
    console.log(chalk.white('─────────────────────────────────────────────'));
  }

  /**
   * 프롬프트 디버그 모드 가져오기
   */
  getDebugMode() {
    const config = this.readFullConfig();
    return config.debugMode || false;
  }

  /**
   * 프롬프트 디버그 모드 설정
   */
  async setDebugMode(enabled) {
    const config = this.readFullConfig();
    config.debugMode = enabled;
    config.lastUpdated = new Date().toISOString();
    
    const success = this.saveFullConfig(config);
    if (success) {
      const status = enabled ? '활성화' : '비활성화';
      console.log(chalk.blue(`✅ 프롬프트 디버그 모드가 ${status}되었습니다.`));
    }
    
    return success;
  }


}

module.exports = new ConfigManager(); 