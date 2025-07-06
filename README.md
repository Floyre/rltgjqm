# rltgjqm

Google Gemini API를 사용하여 자연어로 Git 명령어를 생성하는 CLI 도구입니다.

## 🚀 설치

```bash
npm install -g rltgjqm
```

## 🎯 빠른 시작

### 1. 설치 후 바로 사용
```bash
# 처음 실행시 API 키 설정 안내가 자동으로 나타납니다
rltgjqm

# 또는 바로 명령어 생성
rltgjqm "새 브랜치 만들어줘"
```

### 2. 두 가지 사용 방법

#### 방법 1: 명령행에서 직접 사용
```bash
rltgjqm "새 브랜치 만들어줘"
rltgjqm "커밋하고 푸시해줘" --auto
rltgjqm "변경사항 되돌려줘" --interactive
```

#### 방법 2: 인터랙티브 메뉴 사용
```bash
rltgjqm
```
그러면 다음과 같은 메뉴가 나타납니다:
- 💬 Git 명령어 생성하기
- ⚙️ 설정 관리
- 📖 도움말
- ❌ 종료

## 🔧 설정

### API 키 자동 설정
처음 실행할 때 API 키가 없으면 자동으로 설정 안내가 나타납니다:

1. `rltgjqm` 실행
2. API 키 설정 선택
3. https://ai.google.dev/ 에서 API 키 발급
4. 키 입력 (자동으로 `~/.rltgjqm/.env`에 저장)

### 수동 설정
설정 메뉴를 통해 언제든지 변경할 수 있습니다:
```bash
rltgjqm config
```

## 📖 사용법

### 실행 모드

- **미리보기 모드 (기본값)**: 명령어만 출력
```bash
rltgjqm "커밋하고 푸시해줘"
```

- **자동 실행 모드**: 생성된 명령어를 자동으로 실행
```bash
rltgjqm "커밋하고 푸시해줘" --auto
```

- **인터랙티브 모드**: 각 명령어마다 실행 여부를 확인
```bash
rltgjqm "변경사항 되돌려줘" --interactive
```

### 사용 예시

```bash
# 새 브랜치 생성
rltgjqm "feature/login 브랜치 만들어줘"

# 커밋과 푸시 (자동 실행)
rltgjqm "모든 변경사항 커밋하고 푸시해줘" --auto

# 마지막 커밋 되돌리기 (단계별 확인)
rltgjqm "마지막 커밋 되돌려줘" --interactive

# 브랜치 병합
rltgjqm "develop 브랜치를 main으로 병합해줘"

# 원격 저장소에서 변경사항 가져오기
rltgjqm "원격 저장소에서 최신 변경사항 가져와줘"
```

## ⚙️ 설정 관리

### 설정 메뉴
```bash
rltgjqm config
```

설정 메뉴에서 다음을 할 수 있습니다:
- 🔑 API 키 설정/변경
- 📋 현재 설정 확인
- 🗑️ API 키 삭제
- 🔄 설정 초기화

### API 키 저장 위치
API 키는 사용자 홈 디렉토리에 안전하게 저장됩니다:
```
~/.rltgjqm/.env
```

**우선순위**: 환경변수 > 사용자 설정 파일

## 🛠️ 개발

### 로컬 개발 환경 설정

```bash
# 저장소 클론
git clone https://github.com/yourname/rltgjqm.git
cd rltgjqm

# 의존성 설치
npm install

# 로컬에서 실행
node bin/rltgjqm.js "테스트 명령어"
```

### 디렉토리 구조

```
rltgjqm/
├── bin/
│   └── rltgjqm.js          # CLI 실행 엔트리포인트
├── lib/
│   ├── config.js           # 설정 관리 (API 키, 사용자 설정)
│   ├── gemini.js           # Gemini API 호출 로직
│   ├── promptTemplate.js   # 프롬프트 템플릿 처리
│   └── executor.js         # Git 명령어 실행 로직
├── .env.example            # 환경변수 예시 파일
├── .gitignore
├── package.json
└── README.md
```

## 🔒 보안

- API 키는 사용자 홈 디렉토리에 안전하게 저장됩니다
- API 키는 마스킹 처리되어 표시됩니다
- 위험한 명령어는 실행 전에 경고를 표시합니다

## 🎮 명령어 옵션

```bash
# 기본 사용법
rltgjqm [프롬프트] [옵션]

# 옵션
-a, --auto         생성된 명령어를 자동으로 실행
-i, --interactive  각 명령어마다 실행 여부를 확인
--dry-run          명령어만 출력 (기본값)
-h, --help         도움말 출력
-V, --version      버전 정보 출력

# 추가 명령어
rltgjqm config     설정 관리 메뉴
```

## 🎯 기능

- ✅ 자연어를 Git 명령어로 변환
- ✅ 3가지 실행 모드 (미리보기/자동/인터랙티브)
- ✅ 자동 API 키 설정 및 관리
- ✅ 단순하고 안전한 설정 관리
- ✅ 인터랙티브 메뉴 시스템
- ✅ 안전성 기능 (위험 명령어 감지)
- ✅ 현재 Git 상태 인식
- ✅ 사용자 친화적 인터페이스

## 🔧 문제 해결

### API 키 관련
- API 키가 없으면 자동으로 설정 안내가 나타납니다
- `rltgjqm config`로 언제든지 변경 가능
- 설정 상태는 `rltgjqm config`에서 확인

### 명령어 실행 관련
- 위험한 명령어는 실행 전 경고
- 인터랙티브 모드로 단계별 확인 가능
- Git 저장소가 아닌 경우 자동 감지

## 📝 라이센스

ISC

## 🤝 기여

이슈와 PR은 언제든지 환영합니다!

## 📞 지원

문제가 발생하면 [GitHub Issues](https://github.com/yourname/rltgjqm/issues)에 보고해주세요. 