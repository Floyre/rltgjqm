const axios = require('axios');
const chalk = require('chalk');

/**
 * Gemini API 관련 함수들
 */
class GeminiService {
  constructor() {
    // 최신 Gemini 1.5 Flash 모델 사용
    this.modelName = 'gemini-1.5-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + this.modelName + ':generateContent';
  }

  /**
   * API 키 가져오기 (config.js에서 관리)
   */
  getApiKey() {
    try {
      const config = require('./config');
      return config.getApiKey();
    } catch (error) {
      // config.js를 불러올 수 없으면 환경변수에서 가져오기
      return process.env.GEMINI_API_KEY;
    }
  }

  /**
   * Gemini API를 호출하여 Git 명령어 생성
   * @param {string} prompt - 완성된 프롬프트 (promptTemplate.buildPrompt 결과)
   * @returns {Promise<string>} 생성된 응답 텍스트
   */
  async generateCommand(prompt) {
    try {
      console.log(chalk.blue('🤖 Gemini API 호출 중...'));
      console.log(chalk.gray(`모델: ${this.modelName}`));
      
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
      }

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
        `${this.baseUrl}?key=${apiKey}`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000 // 30초 타임아웃
        }
      );

      // 응답 처리
      if (response.data && response.data.candidates && response.data.candidates.length > 0) {
        const candidate = response.data.candidates[0];
        
        // 안전성 등급 확인
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
        console.log(chalk.green('✅ API 응답 받음'));
        
        return generatedText;
      } else {
        throw new Error('API 응답 형식이 올바르지 않습니다.');
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Gemini API 호출 실패:'));
      
      if (error.response) {
        // HTTP 응답 오류
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 400) {
          console.error(chalk.red('요청 형식이 올바르지 않습니다.'));
          if (data.error && data.error.message) {
            console.error(chalk.red(`상세: ${data.error.message}`));
          }
        } else if (status === 401) {
          console.error(chalk.red('API 키가 유효하지 않습니다. rltgjqm config로 API 키를 확인하세요.'));
        } else if (status === 403) {
          console.error(chalk.red('API 접근 권한이 없습니다. API 키 권한을 확인하세요.'));
        } else if (status === 404) {
          console.error(chalk.red(`모델을 찾을 수 없습니다. 현재 모델: ${this.modelName}`));
          console.error(chalk.yellow('💡 최신 API 키를 사용하고 있는지 확인하세요.'));
        } else if (status === 429) {
          console.error(chalk.red('API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.'));
        } else if (status === 500) {
          console.error(chalk.red('Gemini API 서버 오류입니다. 잠시 후 다시 시도하세요.'));
        } else {
          console.error(chalk.red(`HTTP ${status}: ${error.message}`));
        }
      } else if (error.code === 'ECONNABORTED') {
        console.error(chalk.red('요청 시간 초과. 인터넷 연결을 확인하세요.'));
      } else if (error.code === 'ENOTFOUND') {
        console.error(chalk.red('인터넷 연결을 확인하세요.'));
      } else {
        console.error(chalk.red(error.message));
      }
      
      throw error;
    }
  }

  /**
   * 사용 가능한 모델 목록 가져오기
   */
  async getAvailableModels() {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('API 키가 필요합니다.');
      }

      const response = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          timeout: 10000
        }
      );

      if (response.data && response.data.models) {
        return response.data.models
          .filter(model => model.name.includes('gemini'))
          .map(model => ({
            name: model.name.replace('models/', ''),
            displayName: model.displayName,
            description: model.description
          }));
      }

      return [];
    } catch (error) {
      console.error(chalk.red('모델 목록을 가져올 수 없습니다:'), error.message);
      return [];
    }
  }

  /**
   * API 키 유효성 검사
   * @returns {Promise<boolean>} API 키 유효성 여부
   */
  async validateApiKey() {
    try {
      console.log(chalk.blue('🔑 API 키 유효성 검사 중...'));
      
      const testPrompt = `
간단한 테스트입니다. 
"git status" 명령어만 출력해주세요.
`;

      await this.generateCommand(testPrompt);
      console.log(chalk.green('✅ API 키가 유효합니다.'));
      return true;
    } catch (error) {
      console.log(chalk.red('❌ API 키가 유효하지 않습니다.'));
      return false;
    }
  }

  /**
   * API 연결 상태 확인
   * @returns {Promise<Object>} 연결 상태 정보
   */
  async checkConnection() {
    try {
      const startTime = Date.now();
      const response = await axios.get('https://generativelanguage.googleapis.com', {
        timeout: 5000
      });
      const endTime = Date.now();
      
      return {
        connected: true,
        responseTime: endTime - startTime,
        status: response.status
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * 요청 제한 확인 (일일 한도 등)
   * @returns {Object} 사용량 정보
   */
  getUsageInfo() {
    // 실제 Gemini API에서는 사용량 정보를 제공하지 않으므로
    // 클라이언트 측에서 추정하는 정보만 제공
    return {
      note: 'Gemini API는 사용량 정보를 직접 제공하지 않습니다.',
      recommendation: 'API 키 사용량은 Google Cloud Console에서 확인하세요.',
      currentModel: this.modelName
    };
  }
}

module.exports = new GeminiService(); 