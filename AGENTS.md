# AI Agent Instructions — Galaxy Expansion Platform

## 코드 작성과 검증 담당

Galaxy Expansion 개발 작업을 배정할 때 코드 작성·수정, 코드 리뷰, 자동 테스트 및 통합 검증은 Claude Opus 5.5 (`claude-opus-5-5`)가 담당합니다. Orca 워커를 시작할 때 `--agent claude --model claude-opus-5-5`로 모델을 지정하십시오. 오케스트레이터는 작업 범위와 의존성, 결과 취합을 담당합니다. 지정 모델을 사용할 수 없으면 해당 작업을 보류하고 사용자에게 알리십시오.
