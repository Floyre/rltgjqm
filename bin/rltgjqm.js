#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');

// 버전 정보
const packageJson = require('../package.json');

// 모듈 import
const gemini = require('../lib/gemini');
const promptTemplate = require('../lib/promptTemplate');
const executor = require('../lib/executor');
const config = require('../lib/config');

/**
 * 메인 Git 명령어 생성 및 실행 함수
 */
async function executeGitCommand(promptArg, options) {
  try {
    if (!promptArg) {
      console.clear();
    }
    console.log(chalk.blue('─────────────────────────────────────────────'));
    console.log(chalk.blue('🚀 rltgjqm CLI 시작'));
    console.log(chalk.blue('─────────────────────────────────────────────'));
    
    // 현재 Git 상태 확인 및 표시
    const gitStatus = await executor.getGitStatus();
    executor.displayGitStatus(gitStatus);
    
    console.log(chalk.blue('─────────────────────────────────────────────'));
    
    // API 키 자동 확인 및 설정
    const apiKey = await config.ensureApiKey();
    if (!apiKey) {
      console.log(chalk.red('❌ API 키 설정이 필요합니다.'));
      process.exit(1);
    }

    // 실행 모드 설정
    let mode = 'dry';
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
            if (!input.trim()) {
              return '프롬프트를 입력해주세요.';
            }
            return true;
          },
          prefix: '',
          suffix: ''
        }
      ]);
      userPrompt = answers.userInput;
    }

    console.log(chalk.blue('\n📝 명령어 생성 중...'));
    console.log(chalk.gray(`모드: ${mode}`));

    // 프롬프트 템플릿 생성
    const fullPrompt = promptTemplate.buildPrompt(userPrompt, mode, gitStatus);
    
    // Gemini API 호출
    const response = await gemini.generateCommand(fullPrompt);
    
    // 응답에서 명령어 추출
    const commands = promptTemplate.parseCommands(response);
    
    if (commands.length === 0) {
      console.log(chalk.yellow('⚠️  명령어를 생성할 수 없습니다.'));
      console.log(chalk.gray('다른 방식으로 설명해보세요.'));
      return false;
    }

    // 명령어 출력
    console.log(chalk.green('\n✅ 생성된 명령어:'));
    commands.forEach((cmd, index) => {
      console.log(chalk.cyan(`${index + 1}. ${cmd}`));
    });

    // 실행 모드에 따른 처리
    if (mode === 'dry') {
      console.log(chalk.yellow('\n🧪 드라이런 모드: 명령어를 실행하지 않습니다.'));
      console.log(chalk.gray('실행하려면 --auto 또는 --interactive 옵션을 사용하세요.'));
    } else if (mode === 'auto') {
      console.log(chalk.blue('\n🔄 자동 실행 모드: 모든 명령어를 순서대로 실행합니다.'));
      const results = await executor.executeMultipleCommands(commands, { mode: 'auto' });
      executor.printExecutionSummary(results);
    } else if (mode === 'interactive') {
      console.log(chalk.blue('\n🔍 인터랙티브 모드: 각 명령어를 개별적으로 확인합니다.'));
      const results = await executor.executeMultipleCommands(commands, { mode: 'interactive' });
      executor.printExecutionSummary(results);
    }
    
    console.log(chalk.blue('\n─────────────────────────────────────────────'));
    console.log(chalk.green('🎉 완료!'));
    console.log(chalk.blue('─────────────────────────────────────────────'));
    return true;
    
  } catch (error) {
    console.log(chalk.blue('\n─────────────────────────────────────────────'));
    console.error(chalk.red('❌ 오류 발생:'), error.message);
    if (error.response) {
      console.error(chalk.red('API 응답:'), error.response.data);
    }
    console.log(chalk.blue('─────────────────────────────────────────────'));
    return false;
  }
}

/**
 * 인터랙티브 메인 메뉴
 */
async function showMainMenu() {
  console.clear();
  console.log(chalk.blue('─────────────────────────────────────────────'));
  console.log(chalk.blue('🚀 rltgjqm - Git 명령어 생성 도구'));
  console.log(chalk.blue('─────────────────────────────────────────────'));

  // 현재 Git 상태 확인 및 표시
  const gitStatus = await executor.getGitStatus();
  executor.displayGitStatus(gitStatus);
  
  console.log(chalk.blue('─────────────────────────────────────────────'));

  // 설정 상태 확인
  const configStatus = config.checkConfigStatus();
  if (configStatus.hasApiKey) {
    console.log(chalk.green('✅ API 키가 등록되어 있습니다.'));
  } else {
    console.log(chalk.red('❌ API 키가 설정되지 않았습니다'));
  }

  while (true) {
    const choices = [
      { name: '💬 Git 명령어 생성하기', value: 'generate' },
      { name: '⚙️  설정 관리', value: 'config' },
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
      case 'generate':
        await showGenerateMenu();
        break;
      case 'config':
        await showConfigMenuWrapper();
        break;
      case 'help':
        showHelp();
        break;
      case 'exit':
        console.log(chalk.blue('─────────────────────────────────────────────'));
        console.log(chalk.blue('👋 안녕히 가세요!'));
        console.log(chalk.blue('─────────────────────────────────────────────'));
        process.exit(0);
    }
  }
}

/**
 * 명령어 생성 메뉴
 */
async function showGenerateMenu() {
  console.clear();
  console.log(chalk.blue('─────────────────────────────────────────────'));
  console.log(chalk.blue('🚀 Git 명령어 생성 모드'));
  console.log(chalk.blue('─────────────────────────────────────────────'));

  // 현재 Git 상태 확인 및 표시
  const gitStatus = await executor.getGitStatus();
  executor.displayGitStatus(gitStatus);
  
  console.log(chalk.blue('─────────────────────────────────────────────'));

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

  console.log(chalk.blue('─────────────────────────────────────────────'));
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
function showHelp() {
  console.clear();
  console.log(chalk.blue('─────────────────────────────────────────────'));
  console.log(chalk.blue('📖 rltgjqm 사용법'));
  console.log(chalk.blue('─────────────────────────────────────────────'));
  
  console.log(chalk.yellow('\n명령행에서 직접 사용:'));
  console.log(chalk.cyan('  rltgjqm "새 브랜치 만들어줘"'));
  console.log(chalk.cyan('  rltgjqm "커밋하고 푸시해줘" --auto'));
  console.log(chalk.cyan('  rltgjqm "변경사항 되돌려줘" --interactive'));
  
  console.log(chalk.yellow('\n인터랙티브 모드:'));
  console.log(chalk.cyan('  rltgjqm            # 메뉴 표시'));
  
  console.log(chalk.yellow('\n설정 관리:'));
  console.log(chalk.cyan('  rltgjqm config     # 설정 메뉴'));
  
  console.log(chalk.yellow('\n옵션:'));
  console.log(chalk.gray('  -a, --auto         생성된 명령어를 자동으로 실행'));
  console.log(chalk.gray('  -i, --interactive  각 명령어마다 실행 여부를 확인'));
  console.log(chalk.gray('  --dry-run          명령어만 출력 (기본값)'));
  console.log(chalk.gray('  -h, --help         도움말 출력'));
  console.log(chalk.gray('  -V, --version      버전 정보 출력'));

  console.log(chalk.yellow('\nAPI 키 설정:'));
  console.log(chalk.gray('  API 키는 https://ai.google.dev/ 에서 발급받을 수 있습니다'));
  console.log(chalk.gray('  처음 실행시 자동으로 설정 안내가 나타납니다'));
  
  console.log(chalk.gray('\nGoogle Gemini API를 사용하여 자연어로 Git 명령어를 생성합니다.'));
  
  console.log(chalk.blue('\n─────────────────────────────────────────────'));
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
  .action(async (promptArg, options) => {
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

// 별도 generate 명령어 (하위 호환성)
program
  .command('generate')
  .description('Git 명령어를 생성합니다 (레거시 명령어)')
  .option('-p, --prompt <prompt>', '프롬프트 입력')
  .option('-e, --execute', '생성된 명령어를 바로 실행')
  .action(async (options) => {
    console.log(chalk.yellow('⚠️  generate 명령어는 더 이상 사용되지 않습니다.'));
    console.log(chalk.gray('대신 "rltgjqm [프롬프트] [옵션]" 형태로 사용하세요.'));
    
    const prompt = options.prompt || '';
    const executeFlag = options.execute ? '--auto' : '';
    
    console.log(chalk.blue(`제안: rltgjqm "${prompt}" ${executeFlag}`));
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