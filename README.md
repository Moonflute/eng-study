# English Study Lab

영어 전용 학습 웹앱입니다. 기존 단어 카드형 학습 흐름과 문장 단위 학습 흐름을 한 화면 체계로 합쳤습니다.

## 기능

- TOEFL/TOEIC 단어 트랙
- 영어 문법 트랙
- 스테이지 단위 카드 학습
- 저장, 체크, 다시 보기, 알았음 진행도
- 영어 TTS 발음
- 전체 영어 트랙 검색
- 직접 붙여넣는 영어 대본 문장 학습
- GitHub Pages 배포용 PWA 구성

## 개발 확인

```powershell
npm run check
npm run dev
```

`npm run dev` 실행 후 `http://localhost:4173`에서 확인합니다.

## 배포

`main` 또는 `master` 브랜치에 push하면 `.github/workflows/deploy-pages.yml`이 루트 정적 파일을 GitHub Pages로 배포합니다.
