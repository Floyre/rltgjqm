const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');

/**
 * API 사용량 추적 및 관리 클래스
 */
class UsageTracker {
  constructor() {
    this.configDir = path.join(os.homedir(), '.rltgjqm');
    this.usageFile = path.join(this.configDir, 'usage.json');
    
    // 일일 한도 설정
    this.limits = {
      'chatgpt': {
        name: 'ChatGPT (OpenAI)',
        tier1: 2500000,  // 2.5M 토큰/일
        tier2: 2500000,  // 2.5M 토큰/일
        tier3: 10000000, // 10M 토큰/일
        tier4: 10000000, // 10M 토큰/일
        tier5: 10000000, // 10M 토큰/일
        default: 2500000 // 기본값은 Tier 1-2
      },
      'gemini': {
        name: 'Gemini (Google)',
        estimated: 1000000, // 추정 1M 토큰/일 (실제 한도 불명)
        default: 1000000
      }
    };
    
    this.ensureUsageFile();
  }

  /**
   * 사용량 파일 확인 및 생성
   */
  ensureUsageFile() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.usageFile)) {
      this.resetDailyUsage();
    }
  }

  /**
   * 현재 날짜 (YYYY-MM-DD 형식)
   */
  getCurrentDate() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * 사용량 데이터 읽기
   */
  readUsageData() {
    try {
      const data = fs.readFileSync(this.usageFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return this.getDefaultUsageData();
    }
  }

  /**
   * 기본 사용량 데이터
   */
  getDefaultUsageData() {
    return {
      date: this.getCurrentDate(),
      chatgpt: {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        requests: 0
      },
      gemini: {
        totalTokens: 0,           // 정확한 총 토큰 수 (API 응답에서)
        promptTokens: 0,          // 정확한 입력 토큰 수
        completionTokens: 0,      // 정확한 출력 토큰 수
        estimatedTokens: 0,       // 추정 토큰 수 (하위 호환성)
        requests: 0
      }
    };
  }

  /**
   * 사용량 데이터 저장
   */
  saveUsageData(data) {
    try {
      fs.writeFileSync(this.usageFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(chalk.red(`사용량 데이터 저장 실패: ${error.message}`));
    }
  }

  /**
   * 일일 사용량 초기화 (날짜가 바뀐 경우)
   */
  resetDailyUsage() {
    const data = this.getDefaultUsageData();
    this.saveUsageData(data);
    return data;
  }

  /**
   * ChatGPT 사용량 기록
   */
  recordChatGPTUsage(usageInfo) {
    let data = this.readUsageData();
    
    // 날짜가 바뀌면 초기화
    if (data.date !== this.getCurrentDate()) {
      data = this.resetDailyUsage();
    }

    if (usageInfo) {
      data.chatgpt.totalTokens += usageInfo.total_tokens || 0;
      data.chatgpt.promptTokens += usageInfo.prompt_tokens || 0;
      data.chatgpt.completionTokens += usageInfo.completion_tokens || 0;
    }
    
    data.chatgpt.requests += 1;
    this.saveUsageData(data);
    
    return data.chatgpt;
  }

  /**
   * Gemini 사용량 기록 (추정) - 하위 호환성용
   */
  recordGeminiUsage(promptText, responseText) {
    let data = this.readUsageData();
    
    // 날짜가 바뀌면 초기화
    if (data.date !== this.getCurrentDate()) {
      data = this.resetDailyUsage();
    }

    // 대략적인 토큰 계산 (1토큰 ≈ 4글자)
    const estimatedPromptTokens = Math.ceil((promptText || '').length / 4);
    const estimatedResponseTokens = Math.ceil((responseText || '').length / 4);
    const estimatedTotal = estimatedPromptTokens + estimatedResponseTokens;

    data.gemini.estimatedTokens += estimatedTotal;
    data.gemini.requests += 1;
    
    this.saveUsageData(data);
    
    return {
      estimatedTokens: estimatedTotal,
      totalEstimatedTokens: data.gemini.estimatedTokens
    };
  }

  /**
   * Gemini 사용량 기록 (정확한 API 데이터 사용)
   */
  recordGeminiUsageWithActualData(actualUsage) {
    let data = this.readUsageData();
    
    // 날짜가 바뀌면 초기화
    if (data.date !== this.getCurrentDate()) {
      data = this.resetDailyUsage();
    }

    // ChatGPT와 동일한 형식으로 정확한 토큰 수 저장
    if (!data.gemini.totalTokens) data.gemini.totalTokens = 0;
    if (!data.gemini.promptTokens) data.gemini.promptTokens = 0;
    if (!data.gemini.completionTokens) data.gemini.completionTokens = 0;

    data.gemini.totalTokens += actualUsage.total_tokens || 0;
    data.gemini.promptTokens += actualUsage.prompt_tokens || 0;
    data.gemini.completionTokens += actualUsage.completion_tokens || 0;
    data.gemini.requests += 1;
    
    // 기존 추정값도 업데이트 (하위 호환성)
    data.gemini.estimatedTokens = data.gemini.totalTokens;
    
    this.saveUsageData(data);
    
    return {
      actualTokens: actualUsage.total_tokens,
      totalActualTokens: data.gemini.totalTokens,
      promptTokens: actualUsage.prompt_tokens,
      completionTokens: actualUsage.completion_tokens
    };
  }

  /**
   * 현재 사용량 정보 가져오기
   */
  getCurrentUsage() {
    let data = this.readUsageData();
    
    // 날짜가 바뀌면 초기화
    if (data.date !== this.getCurrentDate()) {
      data = this.resetDailyUsage();
    }

    return data;
  }

  /**
   * 이모티콘 게이지 생성
   */
  createUsageGauge(used, limit, length = 10) {
    const percentage = Math.min(used / limit, 1);
    const filled = Math.floor(percentage * length);
    const empty = length - filled;
    
    let gauge = '';
    let color = chalk.green;
    
    // 색상 결정
    if (percentage >= 0.9) color = chalk.red;
    else if (percentage >= 0.7) color = chalk.yellow;
    else if (percentage >= 0.5) color = chalk.white;
    
    // 게이지 생성
    gauge += color('█'.repeat(filled));
    gauge += chalk.white('░'.repeat(empty));
    
    return gauge;
  }

  /**
   * 사용량 표시 (상세)
   */
  displayUsageInfo(provider) {
    const usage = this.getCurrentUsage();
    const limits = this.limits[provider];
    
    if (!limits) return;

    console.log(chalk.cyan(`\n📊 ${limits.name} 일일 사용량:`));
    
    if (provider === 'chatgpt') {
      const used = usage.chatgpt.totalTokens;
      const limit = limits.default;
      const remaining = Math.max(0, limit - used);
      const percentage = ((used / limit) * 100).toFixed(1);
      
      console.log(chalk.white(`   사용됨: ${used.toLocaleString()} 토큰`));
      console.log(chalk.white(`   남은량: ${remaining.toLocaleString()} 토큰`));
      console.log(chalk.white(`   요청수: ${usage.chatgpt.requests}회`));
      console.log(chalk.white(`   사용률: ${percentage}%`));
      console.log(`   게이지: ${this.createUsageGauge(used, limit)} ${percentage}%`);
      
      if (percentage >= 90) {
        console.log(chalk.red('   ⚠️  일일 한도에 거의 도달했습니다!'));
      } else if (percentage >= 70) {
        console.log(chalk.yellow('   ⚠️  일일 한도의 70%를 사용했습니다.'));
      }
      
    } else if (provider === 'gemini') {
      // 정확한 토큰 수가 있으면 사용, 없으면 추정값 사용
      const hasActualTokens = usage.gemini.totalTokens !== undefined && usage.gemini.totalTokens > 0;
      const used = hasActualTokens ? usage.gemini.totalTokens : usage.gemini.estimatedTokens;
      const limit = limits.default;
      const remaining = Math.max(0, limit - used);
      const percentage = ((used / limit) * 100).toFixed(1);
      
      if (hasActualTokens) {
        console.log(chalk.white(`   실제 사용: ${used.toLocaleString()} 토큰`));
        console.log(chalk.white(`   입력: ${usage.gemini.promptTokens?.toLocaleString() || 0} / 출력: ${usage.gemini.completionTokens?.toLocaleString() || 0}`));
        console.log(chalk.white(`   남은량: ${remaining.toLocaleString()} 토큰`));
        console.log(chalk.white(`   요청수: ${usage.gemini.requests}회`));
        console.log(chalk.white(`   사용률: ${percentage}%`));
        console.log(`   게이지: ${this.createUsageGauge(used, limit)} ${percentage}%`);
        console.log(chalk.green('   ✅ 정확한 사용량 데이터'));
      } else {
        console.log(chalk.white(`   추정 사용: ${used.toLocaleString()} 토큰`));
        console.log(chalk.white(`   추정 남은량: ${remaining.toLocaleString()} 토큰`));
        console.log(chalk.white(`   요청수: ${usage.gemini.requests}회`));
        console.log(chalk.white(`   추정 사용률: ${percentage}%`));
        console.log(`   게이지: ${this.createUsageGauge(used, limit)} ${percentage}%`);
        console.log(chalk.yellow('   💡 추정값입니다 (정확한 사용량은 Google AI Studio에서 확인)'));
      }
    }
  }

  /**
   * 간단한 사용량 표시 (한 줄)
   */
  displayUsageBrief(provider) {
    const usage = this.getCurrentUsage();
    const limits = this.limits[provider];
    
    if (!limits) return '';

    if (provider === 'chatgpt') {
      const used = usage.chatgpt.totalTokens;
      const limit = limits.default;
      const percentage = ((used / limit) * 100).toFixed(1);
      const gauge = this.createUsageGauge(used, limit, 8);
      
      return `📊 ${gauge} ${percentage}% (${usage.chatgpt.requests}회)`;
      
    } else if (provider === 'gemini') {
      // 정확한 토큰 수가 있으면 사용, 없으면 추정값 사용
      const hasActualTokens = usage.gemini.totalTokens !== undefined && usage.gemini.totalTokens > 0;
      const used = hasActualTokens ? usage.gemini.totalTokens : usage.gemini.estimatedTokens;
      const limit = limits.default;
      const percentage = ((used / limit) * 100).toFixed(1);
      const gauge = this.createUsageGauge(used, limit, 8);
      
      const accuracy = hasActualTokens ? '정확' : '추정';
      return `📊 ${gauge} ${percentage}% (${usage.gemini.requests}회, ${accuracy})`;
    }
    
    return '';
  }

  /**
   * 명령어 실행 후 사용량 요약
   */
  displayPostCommandUsage(provider, usageInfo) {
    console.log(chalk.white('\n─────────────────────────────────────────────'));
    console.log(chalk.white('📊 API 사용량 정보'));
    console.log(chalk.white('─────────────────────────────────────────────'));
    
    if (provider === 'chatgpt' && usageInfo) {
      console.log(chalk.green(`✅ 이번 요청: ${(usageInfo.total_tokens || 0).toLocaleString()} 토큰`));
      console.log(chalk.white(`   프롬프트: ${(usageInfo.prompt_tokens || 0).toLocaleString()} 토큰`));
      console.log(chalk.white(`   응답: ${(usageInfo.completion_tokens || 0).toLocaleString()} 토큰`));
    } else if (provider === 'gemini' && usageInfo) {
      console.log(chalk.green(`✅ 이번 요청: 약 ${usageInfo.estimatedTokens.toLocaleString()} 토큰 (추정)`));
    }
    
    this.displayUsageInfo(provider);
  }

  /**
   * 사용량 초기화 (디버깅용)
   */
  resetUsage() {
    this.resetDailyUsage();
    console.log(chalk.green('✅ 사용량이 초기화되었습니다.'));
  }

  /**
   * 사용량 통계 (디버깅용)
   */
  getUsageStats() {
    const usage = this.getCurrentUsage();
    
    return {
      date: usage.date,
      chatgpt: {
        totalTokens: usage.chatgpt.totalTokens,
        requests: usage.chatgpt.requests,
        averageTokensPerRequest: usage.chatgpt.requests > 0 ? 
          Math.round(usage.chatgpt.totalTokens / usage.chatgpt.requests) : 0
      },
      gemini: {
        estimatedTokens: usage.gemini.estimatedTokens,
        requests: usage.gemini.requests,
        averageTokensPerRequest: usage.gemini.requests > 0 ? 
          Math.round(usage.gemini.estimatedTokens / usage.gemini.requests) : 0
      }
    };
  }
}

module.exports = new UsageTracker(); 