#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');

// 한글 입력 최적화 설정
process.stdin.setEncoding('utf8');
if (process.stdout.isTTY) {
  process.stdout.setEncoding('utf8');
}

// 버전 정보
const packageJson = require('../package.json');

// 모듈 import
const aiService = require('../lib/aiService');
const promptTemplate = require('../lib/promptTemplate');
const executor = require('../lib/executor');
const config = require('../lib/config');
const usageTracker = require('../lib/usageTracker');

/**
 * 메인 Git 명령어 생성 및 실행 함수
 */
async function executeGitCommand(promptArg, options) {
  try {
    // 출력 모드 확인
    const outputMode = config.getOutputMode();
    
    if (!promptArg) {
      console.clear();
    }
    
    if (outputMode === 'detail') {
      console.log(chalk.white('─────────────────────────────────────────────'));
      console.log(chalk.white('🚀 rltgjqm CLI 시작'));
      console.log(chalk.white('─────────────────────────────────────────────'));
      
      // 현재 Git 상태 확인 및 표시
      const gitStatus = await executor.getGitStatus();
      executor.displayGitStatus(gitStatus);
      
      console.log(chalk.white('─────────────────────────────────────────────'));
    }
    
    // API 키 자동 확인 및 설정
    const apiKey = await config.ensureApiKey();
    if (!apiKey) {
      console.log(chalk.yellow('⚠️  API 키 설정이 완료되지 않았습니다. 프로그램을 종료합니다.'));
      return false;
    }

    // 기본 실행 모드 확인 및 설정
    const defaultMode = await config.ensureDefaultExecutionMode();

    // 실행 모드 설정 (옵션이 있으면 기본값 오버라이드)
    let mode = defaultMode;
    if (options.auto) mode = 'auto';
    if (options.interactive) mode = 'interactive';
    if (options.dryRun) mode = 'dry';

    // 프롬프트 입력 받기
    let userPrompt;
    if (promptArg) {
      userPrompt = promptArg;
    } else {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'userInput',
          message: '어떤 Git 작업을 하고 싶으신가요?',
          validate: (input) => {
            // 한글 입력 최적화: 입력 완료 후에만 검증
            if (input === '') {
              return '프롬프트를 입력해주세요.';
            }
            const trimmed = input.trim();
            if (trimmed.length === 0) {
              return '프롬프트를 입력해주세요.';
            }
            return true;
          },
          prefix: '',
          suffix: '',
          // 한글 입력 최적화 설정
          transformer: (input) => input,
          filter: (input) => input.trim()
        }
      ]);
      userPrompt = answers.userInput;
    }

    if (outputMode === 'detail') {
      console.log(chalk.white('\n📝 명령어 생성 중...'));
      console.log(chalk.white(`모드: ${mode}`));
    } else {
      console.log(chalk.white('📝 생성 중...'));
    }

    // 현재 Git 상태 확인 (simple 모드에서도 필요하지만 표시하지 않음)
    const gitStatus = await executor.getGitStatus();

    // 프롬프트 템플릿 생성
    const fullPrompt = promptTemplate.buildPrompt(userPrompt, mode, gitStatus);
    
    // AI API 호출
    const result = await aiService.generateCommand(fullPrompt);
    const response = result.response;
    const usageInfo = result.usageInfo;
    
    // 응답에서 명령어 추출
    const commands = promptTemplate.parseCommands(response);
    
    if (commands.length === 0) {
      console.log(chalk.yellow('⚠️  명령어를 생성할 수 없습니다.'));
      console.log(chalk.white('다른 방식으로 설명해보세요.'));
      return false;
    }

    // 명령어 출력
    if (outputMode === 'simple') {
      console.log(chalk.green('✅ 생성된 명령어:'));
    } else {
      console.log(chalk.green('\n✅ 생성된 명령어:'));
    }
    commands.forEach((cmd, index) => {
      console.log(chalk.cyan(`${index + 1}. ${cmd}`));
    });

    // 실행 모드에 따른 처리
    if (mode === 'dry') {
      if (outputMode === 'simple') {
        console.log(chalk.yellow('🧪 미리보기 모드 (실행되지 않음)'));
      } else {
        console.log(chalk.yellow('\n🧪 드라이런 모드: 명령어를 실행하지 않습니다.'));
        console.log(chalk.white('실행하려면 --auto 또는 --interactive 옵션을 사용하세요.'));
      }
    } else if (mode === 'auto') {
      if (outputMode === 'detail') {
        console.log(chalk.white('\n🔄 자동 실행 모드: 모든 명령어를 순서대로 실행합니다.'));
      }
      const results = await executor.executeMultipleCommands(commands, { mode: 'auto' });
      executor.printExecutionSummary(results);
    } else if (mode === 'interactive') {
      if (outputMode === 'detail') {
        console.log(chalk.white('\n🔍 인터랙티브 모드: 각 명령어를 개별적으로 확인합니다.'));
      }
      const results = await executor.executeMultipleCommands(commands, { mode: 'interactive' });
      executor.printExecutionSummary(results);
    }
    
    if (outputMode === 'detail') {
      console.log(chalk.white('\n─────────────────────────────────────────────'));
      console.log(chalk.green('🎉 완료!'));
      console.log(chalk.white('─────────────────────────────────────────────'));
    }
    return true;
    
  } catch (error) {
    console.log(chalk.white('\n─────────────────────────────────────────────'));
    console.error(chalk.red('❌ 오류 발생:'), error.message);
    if (error.response) {
      console.error(chalk.red('API 응답:'), error.response.data);
    }
    console.log(chalk.white('─────────────────────────────────────────────'));
    return false;
  }
}

/**
 * 인터랙티브 메인 메뉴
 */
async function showMainMenu() {
  // 설정 상태 먼저 확인
  const configStatus = config.checkConfigStatus();
  if (!configStatus.hasApiKey) {
    // AI 플랫폼이 설정되지 않았으면 바로 설정 메뉴로
    const apiKey = await config.ensureApiKey();
    if (!apiKey) {
      return; // 종료 선택시 메인 메뉴 종료
    }
    // AI 설정 후 메뉴 새로고침
    return await showMainMenu();
  }
  
  const platformNames = {
    'chatgpt': 'ChatGPT',
    'gemini': 'Gemini'
  };

  while (true) {
    // 메뉴 표시 전 화면 클리어 및 상태 재표시
    console.clear();
    console.log(chalk.white('─────────────────────────────────────────────'));
    console.log(chalk.white('🚀 rltgjqm - Git 명령어 생성 도구'));
    console.log(chalk.white('─────────────────────────────────────────────'));

    // 현재 Git 상태 확인 및 표시
    const gitStatus = await executor.getGitStatus();
    executor.displayGitStatus(gitStatus);
    
    console.log(chalk.white('─────────────────────────────────────────────'));
    
    // 현재 AI 플랫폼 정보 표시
    const currentConfigStatus = config.checkConfigStatus();
    console.log(chalk.green(`✅ AI 플랫폼: ${platformNames[currentConfigStatus.provider] || currentConfigStatus.provider}`));
    
    // 사용량 정보 표시
    const currentUsageBrief = usageTracker.displayUsageBrief(currentConfigStatus.provider);
    if (currentUsageBrief) {
      console.log(chalk.white(`${currentUsageBrief}`));
    }

    const choices = [
      { name: '⚙️  Run 방식 설정하기', value: 'executionMode' },
      { name: '🔧 설정 관리', value: 'config' },
      { name: '📖 도움말', value: 'help' },
      { name: '❌ 종료', value: 'exit' }
    ];

    const { selection: action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: '',
        choices,
        prefix: '',
        suffix: '',
        pageSize: 10,
        loop: false
      }
    ]);

    switch (action) {
      case 'executionMode':
        await config.showExecutionModeMenu();
        break;
      case 'config':
        await showConfigMenuWrapper();
        break;
      case 'help':
        await showHelp();
        break;
      case 'exit':
        console.log(chalk.white('─────────────────────────────────────────────'));
        console.log(chalk.white('👋 안녕히 가세요!'));
        console.log(chalk.white('─────────────────────────────────────────────'));
        process.exit(0);
    }
  }
}

/**
 * 명령어 생성 메뉴
 */
async function showGenerateMenu() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.white('🚀 Git 명령어 생성 모드'));
  console.log(chalk.white('─────────────────────────────────────────────'));

  // 현재 Git 상태 확인 및 표시
  const gitStatus = await executor.getGitStatus();
  executor.displayGitStatus(gitStatus);
  
  console.log(chalk.white('─────────────────────────────────────────────'));

  const choices = [
    { name: '🚀 바로 실행 모드', value: 'auto' },
    { name: '🔍 단계별 확인 모드', value: 'interactive' },
    { name: '👀 미리보기 모드 (실행 안함)', value: 'dry' },
    { name: '↩️  메인 메뉴로', value: 'back' }
  ];

  const { selection: mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selection',
      message: '실행 모드를 선택하세요:',
      choices,
      prefix: '',
      suffix: ''
    }
  ]);

  if (mode === 'back') {
    return;
  }

  const options = {};
  if (mode === 'auto') options.auto = true;
  if (mode === 'interactive') options.interactive = true;
  if (mode === 'dry') options.dryRun = true;

  console.log(chalk.white('─────────────────────────────────────────────'));
  await executeGitCommand(null, options);
}

/**
 * 설정 메뉴 래퍼
 */
async function showConfigMenuWrapper() {
  while (true) {
    const continueConfig = await config.showConfigMenu();
    if (!continueConfig) {
      break; // 메인 메뉴로 돌아가기
    }
  }
}

/**
 * 도움말 표시
 */
async function showHelp() {
  // 완전히 새로운 화면으로 도움말 표시
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.white('📖 rltgjqm 사용법'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  console.log(chalk.yellow('\n명령행에서 직접 사용:'));
  console.log(chalk.cyan('  rltgjqm "새 브랜치 만들어줘"       # 기본 모드로 실행'));
  console.log(chalk.cyan('  rltgjqm "커밋하고 푸시해줘" --auto # 이번만 자동 실행'));
  console.log(chalk.cyan('  rltgjqm "변경사항 되돌려줘" -i    # 이번만 단계별 확인'));
  console.log(chalk.cyan('  깃허브 "새 브랜치 만들어줘"       # 한글 명령어'));
  
  console.log(chalk.yellow('\n설정 관리:'));
  console.log(chalk.cyan('  rltgjqm config                   # 설정 메뉴'));
  console.log(chalk.cyan('  rltgjqm -a                       # 기본 모드: 자동 실행'));
  console.log(chalk.cyan('  rltgjqm -i                       # 기본 모드: 단계별 확인'));
  console.log(chalk.cyan('  rltgjqm --dry                    # 기본 모드: 미리보기'));
  console.log(chalk.cyan('  rltgjqm -d                       # 출력 모드: 상세'));
  console.log(chalk.cyan('  rltgjqm -s                       # 출력 모드: 간단'));
  console.log(chalk.cyan('  rltgjqm --debug                  # 프롬프트 디버그 모드 전환'));
  
  console.log(chalk.yellow('\n옵션 (일회성):'));
  console.log(chalk.white('  -a, --auto         이번만 자동으로 실행'));
  console.log(chalk.cyan('                     예: rltgjqm "커밋하고 푸시" --auto'));
  console.log(chalk.white('  -i, --interactive  이번만 단계별 확인'));
  console.log(chalk.cyan('                     예: rltgjqm "브랜치 삭제" -i'));
  console.log(chalk.white('  --dry-run          이번만 미리보기'));
  console.log(chalk.cyan('                     예: rltgjqm "새 브랜치 만들어" --dry-run'));
  console.log(chalk.white('  -h, --help         도움말 출력'));

  console.log(chalk.yellow('\n💡 설정된 기본 모드가 사용되며, 옵션으로 일회성 변경 가능'));
  console.log(chalk.white('지원되는 AI 플랫폼: ChatGPT, Gemini'));
  
  console.log(chalk.white('\n─────────────────────────────────────────────'));
  
  // 메인 메뉴로 돌아가기 위한 입력 대기
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: '메인 메뉴로 돌아가려면 Enter를 누르세요...',
      prefix: '',
      suffix: ''
    }
  ]);
}



/**
 * UI/UX 색상 테스트
 */
async function testColors() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.magenta('🎨 UI/UX 색상 테스트 - 실제 사용 중인 모든 UI'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  // 구분선들
  console.log(chalk.white('\n📏 구분선 스타일:'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  // 헤더/타이틀 메시지들
  console.log(chalk.white('\n📋 헤더 및 타이틀:'));
  console.log(chalk.white('🚀 rltgjqm CLI 시작'));
  console.log(chalk.white('🚀 rltgjqm - Git 명령어 생성 도구'));
  console.log(chalk.white('🚀 Git 명령어 생성 모드'));
  console.log(chalk.white('📖 rltgjqm 사용법'));
  console.log(chalk.white('           🤖 AI 플랫폼 선택 및 설정'));
  console.log(chalk.white('            🔑 ChatGPT (OpenAI) API 키 설정'));
  console.log(chalk.white('            🔑 Gemini API 키 설정'));
  console.log(chalk.magenta('🐛 디버깅 메뉴 (개발용)'));
  console.log(chalk.magenta('📊 시스템 상태 확인'));
  
  // 진행 상태 메시지들
  console.log(chalk.white('\n⏳ 진행 상태 메시지:'));
  console.log(chalk.white('🤖 AI 명령어 생성 중...'));
  console.log(chalk.white('🤖 Gemini API 호출 중...'));
  console.log(chalk.white('🔑 ChatGPT (OpenAI) API 키 유효성 검사 중...'));
  console.log(chalk.white('🔑 Gemini (Google) API 키 유효성 검사 중...'));
  console.log(chalk.white('\n🔍 API 키 유효성 검사 중...'));
  console.log(chalk.white('📝 명령어 생성 중...'));
  console.log(chalk.white('🔄 명령어 실행 중...'));
  console.log(chalk.white('\n🚀 자동 실행 모드 시작'));
  console.log(chalk.white('\n🔍 인터랙티브 모드 시작'));
  console.log(chalk.white('🔍 연결 테스트 중...'));
  
  // 성공 메시지들
  console.log(chalk.white('\n✅ 성공 메시지:'));
  console.log(chalk.green('✅ ChatGPT (OpenAI) API 키가 유효합니다.'));
  console.log(chalk.green('✅ Gemini (Google) API 키가 유효합니다.'));
  console.log(chalk.green('✅ API 응답 받음'));
  console.log(chalk.green('✅ ChatGPT 응답 받음'));
  console.log(chalk.green('✅ Gemini 응답 받음'));
  console.log(chalk.green('✅ 명령어가 성공적으로 실행되었습니다.'));
  console.log(chalk.green('✅ AI 설정이 저장되었습니다: ~/.rltgjqm/config.json'));
  console.log(chalk.green('✅ API 키가 저장되었습니다: ~/.rltgjqm/.env'));
  console.log(chalk.green('✅ ChatGPT (OpenAI) 설정이 완료되었습니다!'));
  console.log(chalk.green('✅ Git 레포지토리: rltgjqm'));
  console.log(chalk.green('✅ AI 플랫폼: ChatGPT'));
  console.log(chalk.green('\n✅ 생성된 명령어:'));
  console.log(chalk.green('🎉 완료!'));
  
  // 오류 메시지들
  console.log(chalk.white('\n❌ 오류 메시지:'));
  console.log(chalk.red('❌ ChatGPT (OpenAI) API 키가 유효하지 않습니다.'));
  console.log(chalk.red('❌ Gemini (Google) API 키가 유효하지 않습니다.'));
  console.log(chalk.red('\n❌ API 키 유효성 검사에 실패했습니다.'));
  console.log(chalk.red('❌ 명령어 실행 실패. 남은 명령어 3개를 건너뜁니다.'));
  console.log(chalk.red('❌ 사용자가 실행을 중단했습니다.'));
  console.log(chalk.red('❌ Git 레포지토리가 아닙니다'));
  console.log(chalk.red('❌ 실패: 2개'));
  console.log(chalk.red('❌ API 키 설정 저장 실패: permission denied'));
  
  // 경고 메시지들
  console.log(chalk.white('\n⚠️ 경고 메시지:'));
  console.log(chalk.yellow('⚠️  이 메뉴는 개발 및 테스트 목적으로만 사용됩니다.'));
  console.log(chalk.yellow('⚠️  API 키 설정이 완료되지 않았습니다. 프로그램을 종료합니다.'));
  console.log(chalk.yellow('⚠️  명령어를 생성할 수 없습니다.'));
  console.log(chalk.yellow('⚠️  실행이 취소되었습니다.'));
  console.log(chalk.yellow('⚠️  명령어 실행이 취소되었습니다. 남은 명령어 2개를 건너뜁니다.'));
  console.log(chalk.yellow('⚠️  Git 저장소가 아닙니다.'));
  console.log(chalk.yellow('⚠️  설정된 API 키가 없습니다.'));
  console.log(chalk.yellow('⚠️  현재 위치: /Users/user/project'));
  console.log(chalk.yellow('\n⚠️  주의: 이 명령어는 위험할 수 있습니다.'));
  console.log(chalk.yellow('🧪 드라이런 모드: 명령어를 실행하지 않습니다.'));
  console.log(chalk.yellow('🧪 드라이런 모드: 실제로 실행되지 않습니다.'));
  console.log(chalk.yellow('🧪 드라이런 모드가 활성화되었습니다.'));
  console.log(chalk.yellow('🛑 사용자가 실행을 중단했습니다.'));
  console.log(chalk.yellow('⏭️  명령어를 건너뜁니다.'));
  console.log(chalk.yellow('📋 실행된 명령어가 없습니다.'));
  console.log(chalk.yellow('다시 시도하시겠습니까?'));
  console.log(chalk.yellow('설정이 취소되었습니다.'));
  console.log(chalk.yellow('취소되었습니다.'));
  console.log(chalk.yellow('�� 설정을 완료한 후 다시 시도해주세요.'));
  
  // 정보/안내 메시지들
  console.log(chalk.white('\n📄 정보 및 안내 메시지:'));
  console.log(chalk.white('플랫폼: ChatGPT (OpenAI)'));
  console.log(chalk.white('모델: gpt-4o-mini'));
  console.log(chalk.white('모델: gemini-1.5-flash'));
  console.log(chalk.white('모드: interactive'));
  console.log(chalk.white('다른 방식으로 설명해보세요.'));
  console.log(chalk.white('실행하려면 --auto 또는 --interactive 옵션을 사용하세요.'));
  console.log(chalk.white('📍 현재 브랜치: main'));
  console.log(chalk.white('📝 커밋되지 않은 변경사항이 있습니다.'));
  console.log(chalk.white('📤 푸시되지 않은 커밋이 있습니다.'));
  console.log(chalk.white('📊 총 커밋 수: 25개'));
  console.log(chalk.white('📋 상태: 2 staged, 3 modified'));
  console.log(chalk.white('🔗 원격 저장소: 로컬 전용'));
  console.log(chalk.white('📁 레포지토리 루트: /Users/user/project'));
  console.log(chalk.white('   키 소스: 환경변수'));
  console.log(chalk.white('   OPENAI_API_KEY: ✅ 설정됨'));
  console.log(chalk.white('   GEMINI_API_KEY: ❌ 없음'));
  console.log(chalk.white('💡 "git init"으로 레포지토리를 초기화하거나'));
  console.log(chalk.white('   Git 레포지토리 폴더에서 명령어를 실행하세요'));
  
  // 사용자 상호작용 메시지들
  console.log(chalk.white('\n💬 사용자 상호작용:'));
  console.log(chalk.white('rltgjqm은 다음 AI 플랫폼을 지원합니다:'));
  console.log(chalk.white('API 키는 https://platform.openai.com/api-keys 에서 발급받을 수 있습니다.'));
  console.log(chalk.white('API 키는 https://ai.google.dev/ 에서 발급받을 수 있습니다.'));
  console.log(chalk.white('저장 위치:'), chalk.greenBright('~/.rltgjqm/config.json'));
  console.log(chalk.white('취소하려면 "cancel" 또는 "exit"를 입력하세요.'));
  
  // 플랫폼 정보
  console.log(chalk.white('\n📌 플랫폼 정보:'));
  console.log(chalk.cyan('📌 ChatGPT (OpenAI)'));
  console.log(chalk.white('   • 모델: gpt-4o-mini'));
  console.log(chalk.white('   • API 키: https://platform.openai.com/api-keys'));
  console.log(chalk.cyan('📌 Gemini (Google)'));
  console.log(chalk.white('   • 모델: gemini-1.5-flash'));
  console.log(chalk.white('   • API 키: https://ai.google.dev/'));
  
  // 명령어 관련 메시지들
  console.log(chalk.white('\n💻 명령어 관련:'));
  console.log(chalk.cyan('💻 명령어: git add .'));
  console.log(chalk.cyan('💻 git status'));
  console.log(chalk.cyan('1. git add .'));
  console.log(chalk.cyan('2. git commit -m "initial commit"'));
  console.log(chalk.cyan('3. git push origin main'));
  console.log(chalk.cyan('🔗 링크/명령어'));
  console.log(chalk.cyan('📋 1/3: git add .'));
  console.log(chalk.red('🔥 명령어: rm -rf /'));
  console.log(chalk.white('👀 명령어 미리보기:'));
  console.log(chalk.white('🔄 실제 실행 모드로 변경되었습니다.'));
  console.log(chalk.white('📍 현재 위치 정보:'));
  
  // 브랜치 및 Git 상태
  console.log(chalk.white('\n🌿 Git 상태:'));
  console.log(chalk.cyan('🌿 현재 브랜치: main'));
  console.log(chalk.green('🌿 현재 브랜치: develop'));
  console.log(chalk.white('🔗 원격 저장소: github.com/user/repo'));
  
  // 카테고리 섹션들
  console.log(chalk.white('\n📊 카테고리 표시:'));
  console.log(chalk.cyan('\n🔧 Node.js 환경:'));
  console.log(chalk.cyan('\n📦 패키지 정보:'));
  console.log(chalk.cyan('\n🌍 환경변수:'));
  console.log(chalk.cyan('\n💾 메모리 사용량:'));
  console.log(chalk.cyan('\n⚙️  설정 상태:'));
  console.log(chalk.cyan('\n📋 지원되는 AI 플랫폼:'));
  console.log(chalk.cyan('\n📁 설정 디렉터리 정보:'));
  console.log(chalk.cyan('\n📄 설정 파일들:'));
  console.log(chalk.cyan('\n⚙️  현재 활성 설정:'));
  console.log(chalk.cyan('\n📊 현재 Git 저장소 상태:'));
  console.log(chalk.cyan('\n🎨 포맷된 Git 상태 표시:'));
  console.log(chalk.cyan('\n🔍 엔드포인트 연결 테스트:'));
  console.log(chalk.cyan('\n🔍 DNS 해석 테스트:'));
  console.log(chalk.cyan('\n📊 임시 디렉터리:'));
  console.log(chalk.cyan('\n🏠 사용자 홈 디렉터리:'));
  console.log(chalk.cyan('\n💾 rltgjqm 관련 파일들:'));
  console.log(chalk.cyan('\n📈 프로세스 정보:'));
  console.log(chalk.cyan('\n🔧 환경 정보:'));
  
  // 도움말 스타일
  console.log(chalk.white('\n📖 도움말 스타일:'));
  console.log(chalk.yellow('\n명령행에서 직접 사용:'));
  console.log(chalk.cyan('  rltgjqm "새 브랜치 만들어줘"'));
  console.log(chalk.cyan('  rltgjqm "커밋하고 푸시해줘" --auto'));
  console.log(chalk.cyan('  rltgjqm "변경사항 되돌려줘" --interactive'));
  console.log(chalk.yellow('\n설정 관리:'));
  console.log(chalk.cyan('  rltgjqm config     # 설정 메뉴'));
  console.log(chalk.yellow('\n옵션:'));
  console.log(chalk.white('  -a, --auto         생성된 명령어를 자동으로 실행'));
  console.log(chalk.white('  -i, --interactive  각 명령어마다 실행 여부를 확인'));
  console.log(chalk.white('  --dry-run          명령어만 출력 (기본값)'));
  console.log(chalk.white('  -h, --help         도움말 출력'));
  console.log(chalk.white('\n지원되는 AI 플랫폼: ChatGPT, Gemini'));
  console.log(chalk.white('자연어로 Git 명령어를 생성하고 실행합니다.'));
  console.log(chalk.white('\n─────────────────────────────────────────────'));
  console.log(chalk.magenta('위의 모든 메시지들은 현재 코드에서 실제로 사용되는 UI들입니다!'));
  console.log(chalk.white('─────────────────────────────────────────────'));
}

/**
 * 시스템 상태 확인
 */
async function showSystemStatus() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.magenta('📊 시스템 상태 확인'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  // Node.js 정보
  console.log(chalk.cyan('\n🔧 Node.js 환경:'));
  console.log(chalk.white(`   버전: ${process.version}`));
  console.log(chalk.white(`   플랫폼: ${process.platform}`));
  console.log(chalk.white(`   아키텍처: ${process.arch}`));
  console.log(chalk.white(`   작업 디렉터리: ${process.cwd()}`));
  
  // 패키지 정보
  console.log(chalk.cyan('\n📦 패키지 정보:'));
  console.log(chalk.white(`   rltgjqm 버전: ${packageJson.version}`));
  console.log(chalk.white(`   설명: ${packageJson.description}`));
  
  // 환경변수 확인
  console.log(chalk.cyan('\n🌍 환경변수:'));
  console.log(chalk.white(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ 설정됨' : '❌ 없음'}`));
  console.log(chalk.white(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ 설정됨' : '❌ 없음'}`));
  console.log(chalk.white(`   NODE_ENV: ${process.env.NODE_ENV || '설정 안됨'}`));
  
  // 메모리 사용량
  const memUsage = process.memoryUsage();
  console.log(chalk.cyan('\n💾 메모리 사용량:'));
  console.log(chalk.white(`   RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`));
  console.log(chalk.white(`   Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`));
  console.log(chalk.white(`   Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`));
  console.log(chalk.white(`   External: ${(memUsage.external / 1024 / 1024).toFixed(2)} MB`));
  
  // 설정 상태
  const configStatus = config.checkConfigStatus();
  console.log(chalk.cyan('\n⚙️  설정 상태:'));
  console.log(chalk.white(`   API 키: ${configStatus.hasApiKey ? '✅ 설정됨' : '❌ 없음'}`));
  console.log(chalk.white(`   AI 플랫폼: ${configStatus.provider || '설정 안됨'}`));
  console.log(chalk.white(`   키 소스: ${configStatus.keySource || '없음'}`));
  console.log(chalk.white(`   설정 파일: ${configStatus.configExists ? '✅ 존재' : '❌ 없음'}`));
  
  // API 사용량 정보
  if (configStatus.hasApiKey && configStatus.provider) {
    console.log(chalk.cyan('\n📊 오늘의 API 사용량:'));
    const usage = usageTracker.getCurrentUsage();
    const usageBrief = usageTracker.displayUsageBrief(configStatus.provider);
    
    if (configStatus.provider === 'chatgpt') {
      console.log(chalk.white(`   총 토큰: ${usage.chatgpt.totalTokens.toLocaleString()}`));
      console.log(chalk.white(`   요청 수: ${usage.chatgpt.requests}회`));
    } else if (configStatus.provider === 'gemini') {
      console.log(chalk.white(`   추정 토큰: ${usage.gemini.estimatedTokens.toLocaleString()}`));
      console.log(chalk.white(`   요청 수: ${usage.gemini.requests}회`));
    }
    
    if (usageBrief) {
      console.log(chalk.white(`   ${usageBrief}`));
    }
  }
}

/**
 * AI 서비스 연결 테스트
 */
async function testAIConnection() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.magenta('🔗 AI 서비스 연결 테스트'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  const supportedProviders = aiService.getSupportedProviders();
  
  console.log(chalk.cyan('\n📋 지원되는 AI 플랫폼:'));
  for (const [key, provider] of Object.entries(supportedProviders)) {
    console.log(chalk.white(`   ${provider.name}: ${provider.modelName}`));
    console.log(chalk.white(`   엔드포인트: ${provider.endpoint}`));
  }
  
  const { provider, apiKey } = aiService.getConfig();
  
  if (!provider || !apiKey) {
    console.log(chalk.red('\n❌ AI 플랫폼이 설정되지 않았습니다.'));
    return;
  }
  
  console.log(chalk.cyan(`\n🤖 현재 설정: ${supportedProviders[provider].name}`));
      console.log(chalk.white('🔍 연결 테스트 중...'));
  
  try {
    const testResult = await aiService.validateApiKey(provider, apiKey);
    if (testResult) {
      console.log(chalk.green('✅ AI 서비스 연결 성공!'));
    } else {
      console.log(chalk.red('❌ AI 서비스 연결 실패!'));
    }
  } catch (error) {
    console.log(chalk.red(`❌ 연결 테스트 오류: ${error.message}`));
  }
}

/**
 * 설정 파일 디버깅
 */
async function debugConfig() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.magenta('📄 설정 파일 디버깅'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  
  const configDir = path.join(os.homedir(), '.rltgjqm');
  const configFile = path.join(configDir, 'config.json');
  const envFile = path.join(configDir, '.env');
  
  console.log(chalk.cyan('\n📁 설정 디렉터리 정보:'));
  console.log(chalk.white(`   디렉터리: ${configDir}`));
  console.log(chalk.white(`   존재 여부: ${fs.existsSync(configDir) ? '✅' : '❌'}`));
  
  console.log(chalk.cyan('\n📄 설정 파일들:'));
  
  // JSON 설정 파일
  console.log(chalk.white(`   config.json: ${fs.existsSync(configFile) ? '✅ 존재' : '❌ 없음'}`));
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf-8');
      const config = JSON.parse(content);
      console.log(chalk.white('   내용:'));
      console.log(chalk.white(`     AI 플랫폼: ${config.aiProvider || '없음'}`));
      console.log(chalk.white(`     API 키: ${config.apiKey ? '설정됨 (숨김)' : '없음'}`));
      console.log(chalk.white(`     마지막 업데이트: ${config.lastUpdated || '없음'}`));
    } catch (error) {
      console.log(chalk.red(`     오류: ${error.message}`));
    }
  }
  
  // .env 파일 (레거시)
  console.log(chalk.white(`   .env: ${fs.existsSync(envFile) ? '✅ 존재 (레거시)' : '❌ 없음'}`));
  if (fs.existsSync(envFile)) {
    try {
      const content = fs.readFileSync(envFile, 'utf-8');
      console.log(chalk.white('   내용 (레거시):'));
      console.log(chalk.white(`     GEMINI_API_KEY: ${content.includes('GEMINI_API_KEY') ? '설정됨' : '없음'}`));
    } catch (error) {
      console.log(chalk.red(`     오류: ${error.message}`));
    }
  }
  
  // 현재 설정 상태
  const currentConfig = config.getAIConfig();
  console.log(chalk.cyan('\n⚙️  현재 활성 설정:'));
  console.log(chalk.white(`   AI 플랫폼: ${currentConfig.provider || '없음'}`));
  console.log(chalk.white(`   API 키: ${currentConfig.apiKey ? '설정됨' : '없음'}`));
}

/**
 * Git 상태 디스플레이 테스트
 */
async function testGitDisplay() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.magenta('🏗️  Git 상태 디스플레이 테스트'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  try {
    console.log(chalk.cyan('\n📊 현재 Git 저장소 상태:'));
    const gitStatus = await executor.getGitStatus();
    
    console.log(chalk.white('\n원시 Git 상태 데이터:'));
    console.log(chalk.white(JSON.stringify(gitStatus, null, 2)));
    
    console.log(chalk.cyan('\n🎨 포맷된 Git 상태 표시:'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    executor.displayGitStatus(gitStatus);
    console.log(chalk.white('─────────────────────────────────────────────'));
    
  } catch (error) {
    console.log(chalk.red(`❌ Git 상태 확인 오류: ${error.message}`));
  }
}

/**
 * 네트워크 연결 테스트
 */
async function testNetwork() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.magenta('🌐 네트워크 연결 테스트'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  const axios = require('axios');
  
  const endpoints = [
    { name: 'Google', url: 'https://www.google.com' },
    { name: 'OpenAI API', url: 'https://api.openai.com' },
    { name: 'Google AI API', url: 'https://generativelanguage.googleapis.com' },
    { name: 'GitHub', url: 'https://api.github.com' }
  ];
  
  console.log(chalk.cyan('\n🔍 엔드포인트 연결 테스트:'));
  
  for (const endpoint of endpoints) {
    try {
      console.log(chalk.white(`   ${endpoint.name} 테스트 중...`));
      const startTime = Date.now();
      await axios.get(endpoint.url, { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      console.log(chalk.green(`   ✅ ${endpoint.name}: ${responseTime}ms`));
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.log(chalk.red(`   ❌ ${endpoint.name}: 연결 시간 초과`));
      } else if (error.response) {
        console.log(chalk.yellow(`   ⚠️  ${endpoint.name}: HTTP ${error.response.status}`));
      } else {
        console.log(chalk.red(`   ❌ ${endpoint.name}: ${error.message}`));
      }
    }
  }
  
  // DNS 해석 테스트
  console.log(chalk.cyan('\n🔍 DNS 해석 테스트:'));
  const dns = require('dns').promises;
  const domains = ['google.com', 'openai.com', 'github.com'];
  
  for (const domain of domains) {
    try {
      const addresses = await dns.resolve4(domain);
      console.log(chalk.green(`   ✅ ${domain}: ${addresses[0]}`));
    } catch (error) {
      console.log(chalk.red(`   ❌ ${domain}: ${error.message}`));
    }
  }
}

/**
 * 로그 및 캐시 정보
 */
async function showLogsInfo() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.magenta('💾 로그 및 캐시 정보'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  
  console.log(chalk.cyan('\n📊 임시 디렉터리:'));
  console.log(chalk.white(`   시스템 임시 디렉터리: ${os.tmpdir()}`));
  
  console.log(chalk.cyan('\n🏠 사용자 홈 디렉터리:'));
  console.log(chalk.white(`   홈 디렉터리: ${os.homedir()}`));
  
  console.log(chalk.cyan('\n💾 rltgjqm 관련 파일들:'));
  const configDir = path.join(os.homedir(), '.rltgjqm');
  
  if (fs.existsSync(configDir)) {
    try {
      const files = fs.readdirSync(configDir);
      files.forEach(file => {
        const filePath = path.join(configDir, file);
        const stats = fs.statSync(filePath);
        console.log(chalk.white(`   ${file}: ${stats.size} bytes, 수정: ${stats.mtime.toLocaleString()}`));
      });
    } catch (error) {
      console.log(chalk.red(`   디렉터리 읽기 오류: ${error.message}`));
    }
  } else {
    console.log(chalk.white('   rltgjqm 설정 디렉터리가 없습니다.'));
  }
  
  console.log(chalk.cyan('\n📈 프로세스 정보:'));
  console.log(chalk.white(`   프로세스 ID: ${process.pid}`));
  console.log(chalk.white(`   실행 시간: ${Math.floor(process.uptime())}초`));
  console.log(chalk.white(`   명령줄 인수: ${process.argv.join(' ')}`));
  
  console.log(chalk.cyan('\n🔧 환경 정보:'));
  console.log(chalk.white(`   셸: ${process.env.SHELL || '알 수 없음'}`));
  console.log(chalk.white(`   터미널: ${process.env.TERM || '알 수 없음'}`));
  console.log(chalk.white(`   사용자: ${process.env.USER || process.env.USERNAME || '알 수 없음'}`));
}

/**
 * API 사용량 통계 표시
 */
async function showUsageStats() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.magenta('📈 API 사용량 통계'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  const stats = usageTracker.getUsageStats();
  const currentUsage = usageTracker.getCurrentUsage();
  
  console.log(chalk.cyan(`\n📅 날짜: ${stats.date}`));
  
  // ChatGPT 통계
  console.log(chalk.cyan('\n🤖 ChatGPT (OpenAI) 통계:'));
  if (stats.chatgpt.requests > 0) {
    console.log(chalk.white(`   총 사용 토큰: ${stats.chatgpt.totalTokens.toLocaleString()}`));
    console.log(chalk.white(`   총 요청 수: ${stats.chatgpt.requests.toLocaleString()}회`));
    console.log(chalk.white(`   평균 토큰/요청: ${stats.chatgpt.averageTokensPerRequest.toLocaleString()}`));
    console.log(chalk.white(`   프롬프트 토큰: ${currentUsage.chatgpt.promptTokens.toLocaleString()}`));
    console.log(chalk.white(`   응답 토큰: ${currentUsage.chatgpt.completionTokens.toLocaleString()}`));
    
    usageTracker.displayUsageInfo('chatgpt');
  } else {
    console.log(chalk.white('   오늘 사용 기록이 없습니다.'));
  }
  
  // Gemini 통계
  console.log(chalk.cyan('\n🧠 Gemini (Google) 통계:'));
  if (stats.gemini.requests > 0) {
    console.log(chalk.white(`   총 추정 토큰: ${stats.gemini.estimatedTokens.toLocaleString()}`));
    console.log(chalk.white(`   총 요청 수: ${stats.gemini.requests.toLocaleString()}회`));
    console.log(chalk.white(`   평균 토큰/요청: ${stats.gemini.averageTokensPerRequest.toLocaleString()}`));
    
    usageTracker.displayUsageInfo('gemini');
  } else {
    console.log(chalk.white('   오늘 사용 기록이 없습니다.'));
  }
  
  // 전체 통계
  const totalRequests = stats.chatgpt.requests + stats.gemini.requests;
  console.log(chalk.cyan('\n📊 전체 통계:'));
  console.log(chalk.white(`   총 요청 수: ${totalRequests.toLocaleString()}회`));
  
  if (totalRequests > 0) {
    const chatgptPercentage = ((stats.chatgpt.requests / totalRequests) * 100).toFixed(1);
    const geminiPercentage = ((stats.gemini.requests / totalRequests) * 100).toFixed(1);
    
    console.log(chalk.white(`   ChatGPT 사용 비율: ${chatgptPercentage}%`));
    console.log(chalk.white(`   Gemini 사용 비율: ${geminiPercentage}%`));
  }
  
  // 사용량 파일 정보
  console.log(chalk.cyan('\n📄 사용량 파일:'));
  console.log(chalk.white(`   경로: ${usageTracker.usageFile}`));
  
  try {
    const fs = require('fs');
    const stats = fs.statSync(usageTracker.usageFile);
    console.log(chalk.white(`   크기: ${stats.size} bytes`));
    console.log(chalk.white(`   수정일: ${stats.mtime.toLocaleString()}`));
  } catch (error) {
    console.log(chalk.red('   파일 정보를 읽을 수 없습니다.'));
  }
}

/**
 * 사용량 초기화
 */
async function resetUsageStats() {
  console.clear();
  console.log(chalk.white('─────────────────────────────────────────────'));
  console.log(chalk.magenta('🔄 사용량 초기화'));
  console.log(chalk.white('─────────────────────────────────────────────'));
  
  const stats = usageTracker.getUsageStats();
  
  console.log(chalk.yellow('\n⚠️  현재 사용량:'));
  console.log(chalk.white(`   ChatGPT: ${stats.chatgpt.totalTokens.toLocaleString()} 토큰, ${stats.chatgpt.requests}회`));
  console.log(chalk.white(`   Gemini: ${stats.gemini.estimatedTokens.toLocaleString()} 토큰 (추정), ${stats.gemini.requests}회`));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '정말로 모든 사용량 데이터를 초기화하시겠습니까?',
      default: false,
      prefix: '',
      suffix: ''
    }
  ]);
  
  if (confirm) {
    usageTracker.resetUsage();
    console.log(chalk.white('\n─────────────────────────────────────────────'));
    console.log(chalk.green('✅ 사용량 데이터가 초기화되었습니다!'));
    console.log(chalk.white('─────────────────────────────────────────────'));
  } else {
    console.log(chalk.white('\n─────────────────────────────────────────────'));
    console.log(chalk.yellow('취소되었습니다.'));
    console.log(chalk.white('─────────────────────────────────────────────'));
  }
}

// CLI 프로그램 설정
program
  .name('rltgjqm')
  .description('Gemini API를 사용한 Git 명령어 생성 CLI')
  .version(packageJson.version);

// 메인 명령어 (프롬프트 직접 입력)
program
  .argument('[prompt]', '자연어로 Git 작업을 설명하세요')
  .option('-a, --auto', '생성된 명령어를 자동으로 실행')
  .option('-i, --interactive', '각 명령어마다 실행 여부를 확인')
  .option('--dry-run', '명령어만 출력 (실행하지 않음)')
  .option('--dry', '기본 실행 모드를 미리보기로 변경')
  .option('-d, --detail', '상세 출력 모드로 변경')
  .option('-s, --simple', '간단 출력 모드로 변경')
  .option('--debug', '프롬프트 디버그 모드 전환')
  .action(async (promptArg, options) => {
    // 프롬프트 없이 옵션만 주어진 경우 설정 변경
    if (!promptArg && (options.auto || options.interactive || options.dryRun || options.dry || options.detail || options.simple || options.debug)) {
      if (options.auto) {
        await config.setDefaultExecutionMode('auto');
        return;
      }
      if (options.interactive) {
        await config.setDefaultExecutionMode('interactive');
        return;
      }
      if (options.dryRun || options.dry) {
        await config.setDefaultExecutionMode('dry');
        return;
      }
      if (options.detail) {
        await config.setOutputMode('detail');
        return;
      }
      if (options.simple) {
        await config.setOutputMode('simple');
        return;
      }
      if (options.debug) {
        await config.setDebugMode(!config.getDebugMode());
        return;
      }
    }

    if (promptArg) {
      // 프롬프트가 주어진 경우 바로 실행
      await executeGitCommand(promptArg, options);
    } else {
      // 프롬프트가 없으면 인터랙티브 메뉴
      await showMainMenu();
    }
  });

// 설정 관리 명령어
program
  .command('config')
  .description('설정 관리 (API 키, 기본 동작 등)')
  .action(async () => {
    await showConfigMenuWrapper();
  });

// 프로그램 실행
if (process.argv.length <= 2) {
  // 명령어가 없을 경우 인터랙티브 메뉴 표시
  showMainMenu().catch(error => {
    console.error(chalk.red('❌ 오류 발생:'), error.message);
    process.exit(1);
  });
} else {
  program.parse(process.argv);
} 