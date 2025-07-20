/**
 * 프롬프트 템플릿 관련 함수들
 */
class PromptTemplate {
  constructor() {
    this.baseTemplate = `
당신은 Git 명령어 전문가입니다. 사용자의 요청을 받아 적절한 Git 명령어를 생성해주세요.

규칙:
1. 명령어는 정확하고 안전해야 합니다.
2. 위험한 명령어의 경우 경고를 포함해주세요.
3. 명령어에 대한 간단한 설명을 포함해주세요.
4. 한 번에 하나의 명령어만 제안해주세요.
5. 응답은 다음 형식으로 해주세요:

\`\`\`bash
[git 명령어]
\`\`\`

**설명:** [명령어에 대한 설명]

**주의사항:** [있다면 주의사항]

사용자 요청: {prompt}
`;
  }

  /**
   * 메인 프롬프트 템플릿 생성 함수 (사용자 요구사항)
   * @param {string} userInput - 사용자의 자연어 입력
   * @param {string} mode - 실행 모드 ('dry', 'auto', 'interactive')
   * @param {Object} gitStatus - 현재 Git 상태 정보
   * @returns {string} 완성된 프롬프트
   */
  buildPrompt(userInput, mode = 'dry', gitStatus = {}) {
    // 기본 템플릿 사용
    const base = `
너는 Git 전문가야.
사용자의 목적은: ${userInput}

이에 따라 사용자가 터미널에서 직접 실행할 수 있도록 Git 명령어만 정확하게 출력해줘.
- 설명 없이 명령어만 한 줄씩 출력해줘
- 각 명령어는 새로운 줄에 작성해줘
- 명령어 앞에 번호나 기호를 붙이지 마
- 필요한 경우 gh 명령어(GitHub CLI)도 사용해도 좋아`;

    const modeInstructions = {
      'dry': '중간 설명 없이 바로 실행 가능한 상태로 정리해줘.',
      'auto': '자동 실행용으로 안전하고 순서대로 실행 가능한 명령어들을 작성해줘.',
      'interactive': '각 단계가 명확히 나뉘도록 순서대로 작성해줘. 사용자가 각 단계를 확인할 수 있게 해줘.'
    };

    const suffix = modeInstructions[mode] || modeInstructions['dry'];

    // Git 상태 정보 추가
    let contextInfo = '\n현재 환경 정보:';
    
    if (gitStatus.isGitRepository) {
      contextInfo += `\n✅ Git 레포지토리: ${gitStatus.repositoryName}`;
      contextInfo += `\n📁 레포지토리 경로: ${gitStatus.repoRoot}`;
      contextInfo += `\n📍 현재 작업 디렉토리: ${gitStatus.currentDir}`;
      
      if (gitStatus.remoteUrl) {
        contextInfo += `\n🔗 원격 저장소: ${gitStatus.remoteUrl}`;
      } else {
        contextInfo += `\n🔗 원격 저장소: 로컬 전용`;
      }
      
      if (gitStatus.currentBranch) {
        contextInfo += `\n🌿 현재 브랜치: ${gitStatus.currentBranch}`;
      }
      
      if (gitStatus.totalCommits > 0) {
        contextInfo += `\n📊 총 커밋 수: ${gitStatus.totalCommits}개`;
      }
      
      if (!gitStatus.isInRepoRoot) {
        contextInfo += `\n⚠️  현재 위치가 레포지토리 루트가 아님`;
      }
      
      if (gitStatus.hasUncommittedChanges) {
        contextInfo += `\n📝 커밋되지 않은 변경사항이 있음`;
        if (gitStatus.workingTree) {
          const fileCount = gitStatus.workingTree.split('\n').length;
          contextInfo += `\n📄 변경된 파일: ${fileCount}개`;
        }
      } else {
        contextInfo += `\n✨ 작업 트리가 클린 상태`;
      }
      
      if (gitStatus.hasUnpushedCommits) {
        contextInfo += `\n📤 푸시되지 않은 커밋이 있음`;
      }
      
    } else {
      contextInfo += `\n❌ Git 레포지토리가 아님`;
      contextInfo += `\n📁 현재 디렉토리: ${gitStatus.currentDir}`;
      contextInfo += `\n💡 Git 관련 명령어를 위해서는 레포지토리 초기화가 필요할 수 있음`;
    }

    return `${base}${contextInfo}\n\n${suffix}`;
  }

  /**
   * Gemini API 응답에서 명령어 추출
   * @param {string} response - Gemini API 응답 텍스트
   * @returns {Array<string>} 추출된 명령어 배열
   */
  parseCommands(response) {
    const commands = [];
    
    // 코드 블록에서 명령어 추출
    const codeBlocks = response.match(/```(?:bash|shell|sh)?\n([\s\S]*?)```/g);
    if (codeBlocks) {
      codeBlocks.forEach(block => {
        const content = block.replace(/```(?:bash|shell|sh)?\n?/g, '').replace(/```/g, '');
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        commands.push(...lines.map(line => line.trim()));
      });
    }

    // 코드 블록이 없는 경우 git으로 시작하는 라인 추출
    if (commands.length === 0) {
      const lines = response.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('git ') || trimmed.startsWith('gh ')) {
          commands.push(trimmed);
        }
      });
    }

    // 여전히 명령어가 없는 경우 전체 텍스트에서 git 명령어 패턴 찾기
    if (commands.length === 0) {
      const gitCommands = response.match(/git\s+[\w\s\-\.\/]+/g);
      if (gitCommands) {
        commands.push(...gitCommands.map(cmd => cmd.trim()));
      }
    }

    // 중복 제거 및 정리
    return [...new Set(commands)].filter(cmd => cmd.length > 0);
  }

  /**
   * 프롬프트 템플릿 생성 (기존 함수 - 호환성 유지)
   * @param {string} userPrompt - 사용자 입력 프롬프트
   * @returns {string} 완성된 프롬프트
   */
  generatePrompt(userPrompt) {
    return this.baseTemplate.replace('{prompt}', userPrompt);
  }

  /**
   * 특정 작업에 대한 프롬프트 템플릿 생성
   * @param {string} taskType - 작업 유형 (commit, branch, merge, etc.)
   * @param {string} userPrompt - 사용자 입력 프롬프트
   * @returns {string} 맞춤형 프롬프트
   */
  generateTaskSpecificPrompt(taskType, userPrompt) {
    const taskTemplates = {
      commit: `
커밋과 관련된 Git 명령어를 생성해주세요.
- 커밋 메시지는 명확하고 간결해야 합니다.
- 컨벤션을 따르는 커밋 메시지를 작성해주세요.
- 필요한 경우 파일 추가(add) 명령어도 포함해주세요.

사용자 요청: {prompt}
`,
      branch: `
브랜치와 관련된 Git 명령어를 생성해주세요.
- 브랜치 이름은 명확하고 의미있어야 합니다.
- 현재 브랜치 상태를 고려해주세요.
- 필요한 경우 브랜치 전환 명령어도 포함해주세요.

사용자 요청: {prompt}
`,
      merge: `
병합과 관련된 Git 명령어를 생성해주세요.
- 병합 전 상태 확인을 권장해주세요.
- 충돌 가능성을 고려해주세요.
- 안전한 병합 절차를 제안해주세요.

사용자 요청: {prompt}
`,
      revert: `
되돌리기와 관련된 Git 명령어를 생성해주세요.
- 되돌리기 전 백업을 권장해주세요.
- 다양한 되돌리기 옵션을 고려해주세요.
- 안전한 되돌리기 절차를 제안해주세요.

사용자 요청: {prompt}
`
    };

    const template = taskTemplates[taskType] || this.baseTemplate;
    return template.replace('{prompt}', userPrompt);
  }

  /**
   * 사용자 입력에서 작업 유형 감지
   * @param {string} userPrompt - 사용자 입력 프롬프트
   * @returns {string} 감지된 작업 유형
   */
  detectTaskType(userPrompt) {
    const prompt = userPrompt.toLowerCase();
    
    if (prompt.includes('commit') || prompt.includes('커밋')) {
      return 'commit';
    }
    if (prompt.includes('branch') || prompt.includes('브랜치')) {
      return 'branch';
    }
    if (prompt.includes('merge') || prompt.includes('병합')) {
      return 'merge';
    }
    if (prompt.includes('revert') || prompt.includes('되돌리') || prompt.includes('reset')) {
      return 'revert';
    }
    
    return 'general';
  }

  /**
   * 컨텍스트를 포함한 프롬프트 생성
   * @param {string} userPrompt - 사용자 입력 프롬프트
   * @param {Object} context - 현재 Git 상태 정보
   * @returns {string} 컨텍스트가 포함된 프롬프트
   */
  generateContextualPrompt(userPrompt, context = {}) {
    const contextInfo = [];
    
    if (context.currentBranch) {
      contextInfo.push(`현재 브랜치: ${context.currentBranch}`);
    }
    if (context.hasUncommittedChanges) {
      contextInfo.push('커밋되지 않은 변경사항이 있습니다.');
    }
    if (context.hasUnpushedCommits) {
      contextInfo.push('푸시되지 않은 커밋이 있습니다.');
    }
    
    let prompt = this.generatePrompt(userPrompt);
    
    if (contextInfo.length > 0) {
      prompt += `\n\n현재 상태:\n${contextInfo.join('\n')}`;
    }
    
    return prompt;
  }

  /**
   * 명령어 검증 및 안전성 확인
   * @param {Array<string>} commands - 검증할 명령어 배열
   * @returns {Object} 검증 결과
   */
  validateCommands(commands) {
    const dangerousPatterns = [
      /git\s+reset\s+--hard/,
      /git\s+clean\s+-f/,
      /git\s+push\s+--force/,
      /rm\s+-rf/,
      /git\s+filter-branch/
    ];

    const issues = [];
    const warnings = [];

    commands.forEach((command, index) => {
      // 위험한 명령어 검사
      dangerousPatterns.forEach(pattern => {
        if (pattern.test(command)) {
          warnings.push(`명령어 ${index + 1}: "${command}" - 위험할 수 있는 명령어입니다.`);
        }
      });

      // 기본 구문 검사
      if (!command.startsWith('git ') && !command.startsWith('gh ')) {
        issues.push(`명령어 ${index + 1}: "${command}" - Git 명령어가 아닙니다.`);
      }
    });

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      commandCount: commands.length
    };
  }
}

module.exports = new PromptTemplate(); 