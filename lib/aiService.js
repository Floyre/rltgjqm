const axios = require('axios');
const chalk = require('chalk');
const usageTracker = require('./usageTracker');

/**
 * 통합 AI 서비스 클래스 - ChatGPT와 Gemini 지원
 */
class AIService {
  constructor() {
    this.supportedProviders = {
      'chatgpt': {
        name: 'ChatGPT (OpenAI)',
        modelName: 'gpt-4o-mini',
        endpoint: 'https://api.openai.com/v1/chat/completions'
      },
      'gemini': {
        name: 'Gemini (Google)',
        modelName: 'gemini-1.5-flash',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
      }
    };
  }

  /**
   * 설정된 AI 플랫폼과 API 키 가져오기
   */
  getConfig() {
    try {
      // 임시 설정이 있으면 우선 사용 (테스트용)
      if (this.tempConfig) {
        return this.tempConfig;
      }
      
      const config = require('./config');
      return config.getAIConfig();
    } catch (error) {
      return { provider: null, apiKey: null };
    }
  }

  /**
   * AI 플랫폼별 Git 명령어 생성
   * @param {string} prompt - 완성된 프롬프트
   * @returns {Promise<{response: string, usageInfo: object}>} 생성된 응답 텍스트와 사용량 정보
   */
  async generateCommand(prompt) {
    const { provider, apiKey } = this.getConfig();
    
    if (!provider || !apiKey) {
      throw new Error('AI 플랫폼이 설정되지 않았습니다.');
    }

    let outputMode = 'detail'; // 기본값
    let debugMode = false; // 기본값
    try {
      const config = require('./config');
      outputMode = config.getOutputMode();
      debugMode = config.getDebugMode();
    } catch (error) {
      // config 로딩 실패시 기본값 사용
    }

    if (outputMode === 'detail') {
      console.log(chalk.white('🤖 AI 명령어 생성 중...'));
      console.log(chalk.white(`플랫폼: ${this.supportedProviders[provider].name}`));
      console.log(chalk.white(`모델: ${this.supportedProviders[provider].modelName}`));
    }

    // 디버그 모드에서 전달되는 프롬프트 표시
    if (debugMode) {
      console.log(chalk.magenta('\n🔍 [DEBUG] 전달되는 프롬프트:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.gray(prompt));
      console.log(chalk.gray('─'.repeat(50)));
    }

    try {
      switch (provider) {
        case 'chatgpt':
          return await this.callChatGPT(prompt, apiKey);
        case 'gemini':
          return await this.callGemini(prompt, apiKey);
        default:
          throw new Error(`지원하지 않는 AI 플랫폼: ${provider}`);
      }
    } catch (error) {
      console.error(chalk.red('❌ AI API 호출 실패:'));
      throw error;
    }
  }

  /**
   * ChatGPT API 호출
   */
  async callChatGPT(prompt, apiKey) {
    let outputMode = 'detail'; // 기본값
    let debugMode = false; // 기본값
    try {
      const config = require('./config');
      outputMode = config.getOutputMode();
      debugMode = config.getDebugMode();
    } catch (error) {
      // config 로딩 실패시 기본값 사용
    }

    try {
      const response = await axios.post(
        this.supportedProviders.chatgpt.endpoint,
        {
          model: this.supportedProviders.chatgpt.modelName,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 2048
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const generatedText = response.data.choices[0].message.content;
        const usageInfo = response.data.usage;
        
        console.log(chalk.green('✅ ChatGPT 응답 받음'));
        
        // 디버그 모드에서 받은 응답 표시
        if (outputMode === 'detail' && debugMode) {
          console.log(chalk.magenta('\n🔍 [DEBUG] 받은 응답:'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(chalk.gray(generatedText));
          console.log(chalk.gray('─'.repeat(50)));
        }
        
        // 사용량 기록
        const recordedUsage = usageTracker.recordChatGPTUsage(usageInfo);
        
        return {
          response: generatedText,
          usageInfo: usageInfo
        };
      } else {
        throw new Error('ChatGPT API 응답 형식이 올바르지 않습니다.');
      }

    } catch (error) {
      this.handleChatGPTError(error);
      throw error;
    }
  }

  /**
   * Gemini API 호출
   */
  async callGemini(prompt, apiKey) {
    let outputMode = 'detail'; // 기본값
    let debugMode = false; // 기본값
    try {
      const config = require('./config');
      outputMode = config.getOutputMode();
      debugMode = config.getDebugMode();
    } catch (error) {
      // config 로딩 실패시 기본값 사용
    }

    try {
      const requestData = {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
          stopSequences: []
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH", 
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE"
          }
        ]
      };

      const response = await axios.post(
        `${this.supportedProviders.gemini.endpoint}?key=${apiKey}`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.candidates && response.data.candidates.length > 0) {
        const candidate = response.data.candidates[0];
        
        if (candidate.finishReason === 'SAFETY') {
          throw new Error('안전성 필터로 인해 응답이 차단되었습니다. 다른 방식으로 질문해보세요.');
        }
        
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('저작권 문제로 응답이 차단되었습니다. 다른 방식으로 질문해보세요.');
        }
        
        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
          throw new Error('빈 응답을 받았습니다. 다시 시도해보세요.');
        }
        
        const generatedText = candidate.content.parts[0].text;
        
        // 정확한 사용량 정보 추출 (Gemini API는 usageMetadata 제공)
        const usageMetadata = response.data.usageMetadata || {};
        const actualUsage = {
          prompt_tokens: usageMetadata.promptTokenCount || 0,
          completion_tokens: usageMetadata.candidatesTokenCount || 0,
          total_tokens: usageMetadata.totalTokenCount || 0
        };
        
        console.log(chalk.green('✅ Gemini 응답 받음'));
        if (outputMode === 'detail') {
          console.log(chalk.white(`📊 실제 사용량: ${actualUsage.prompt_tokens} → ${actualUsage.completion_tokens} (총 ${actualUsage.total_tokens} 토큰)`));
        }
        
        // 디버그 모드에서 받은 응답 표시
        if (outputMode === 'detail' && debugMode) {
          console.log(chalk.magenta('\n🔍 [DEBUG] 받은 응답:'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(chalk.gray(generatedText));
          console.log(chalk.gray('─'.repeat(50)));
        }
        
        // 정확한 사용량 정보로 기록
        const usageInfo = usageTracker.recordGeminiUsageWithActualData(actualUsage);
        
        return {
          response: generatedText,
          usageInfo: usageInfo
        };
      } else {
        throw new Error('Gemini API 응답 형식이 올바르지 않습니다.');
      }

    } catch (error) {
      this.handleGeminiError(error);
      throw error;
    }
  }

  /**
   * ChatGPT 에러 처리
   */
  handleChatGPTError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        console.error(chalk.red('ChatGPT API 키가 유효하지 않습니다. rltgjqm config로 API 키를 확인하세요.'));
      } else if (status === 429) {
        console.error(chalk.red('ChatGPT API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.'));
      } else if (status === 500) {
        console.error(chalk.red('ChatGPT API 서버 오류입니다. 잠시 후 다시 시도하세요.'));
      } else {
        console.error(chalk.red(`ChatGPT HTTP ${status}: ${error.message}`));
      }
    } else if (error.code === 'ECONNABORTED') {
      console.error(chalk.red('요청 시간 초과. 인터넷 연결을 확인하세요.'));
    } else if (error.code === 'ENOTFOUND') {
      console.error(chalk.red('인터넷 연결을 확인하세요.'));
    } else {
      console.error(chalk.red(error.message));
    }
  }

  /**
   * Gemini 에러 처리
   */
  handleGeminiError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 400) {
        console.error(chalk.red('Gemini 요청 형식이 올바르지 않습니다.'));
        if (data.error && data.error.message) {
          console.error(chalk.red(`상세: ${data.error.message}`));
        }
      } else if (status === 401) {
        console.error(chalk.red('Gemini API 키가 유효하지 않습니다. rltgjqm config로 API 키를 확인하세요.'));
      } else if (status === 403) {
        console.error(chalk.red('Gemini API 접근 권한이 없습니다. API 키 권한을 확인하세요.'));
      } else if (status === 404) {
        console.error(chalk.red(`Gemini 모델을 찾을 수 없습니다. 현재 모델: ${this.supportedProviders.gemini.modelName}`));
      } else if (status === 429) {
        console.error(chalk.red('Gemini API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.'));
      } else if (status === 500) {
        console.error(chalk.red('Gemini API 서버 오류입니다. 잠시 후 다시 시도하세요.'));
      } else {
        console.error(chalk.red(`Gemini HTTP ${status}: ${error.message}`));
      }
    } else if (error.code === 'ECONNABORTED') {
      console.error(chalk.red('요청 시간 초과. 인터넷 연결을 확인하세요.'));
    } else if (error.code === 'ENOTFOUND') {
      console.error(chalk.red('인터넷 연결을 확인하세요.'));
    } else {
      console.error(chalk.red(error.message));
    }
  }

  /**
   * 임시 AI 설정 (테스트용)
   */
  setTempConfig(provider, apiKey) {
    this.tempConfig = { provider, apiKey };
  }

  /**
   * 임시 설정 초기화
   */
  clearTempConfig() {
    this.tempConfig = null;
  }

  /**
   * AI 플랫폼별 API 키 유효성 검사
   * @param {string} provider - AI 플랫폼 ('chatgpt' | 'gemini')
   * @param {string} apiKey - API 키
   * @returns {Promise<boolean>} API 키 유효성 여부
   */
  async validateApiKey(provider, apiKey) {
    try {
      console.log(chalk.white(`🔑 ${this.supportedProviders[provider].name} API 키 유효성 검사 중...`));
      
      const testPrompt = `간단한 테스트입니다. "git status" 명령어만 출력해주세요.`;

      // 임시로 설정하여 테스트
      const originalConfig = this.getConfig();
      
      // 테스트를 위해 임시 설정
      this.setTempConfig(provider, apiKey);
      
      const result = await this.generateCommand(testPrompt);
      
      // 원래 설정 복구
      this.setTempConfig(originalConfig.provider, originalConfig.apiKey);
      
      console.log(chalk.green(`✅ ${this.supportedProviders[provider].name} API 키가 유효합니다.`));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ ${this.supportedProviders[provider].name} API 키가 유효하지 않습니다.`));
      // 임시 설정 초기화
      this.clearTempConfig();
      return false;
    }
  }

  /**
   * 지원하는 AI 플랫폼 목록 반환
   */
  getSupportedProviders() {
    return this.supportedProviders;
  }
}

module.exports = new AIService(); 