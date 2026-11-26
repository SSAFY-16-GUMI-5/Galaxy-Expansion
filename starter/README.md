# Galaxy Expansion 참가자 Starter

Node.js 22 이상이 필요합니다. ZIP을 풀고 `bridge/`와 `starter/`가 함께 있는 폴더에서 실행하세요. 참가자 PC에서 npm 패키지를 설치할 필요는 없습니다.

1. 운영자가 안내한 웹 페이지를 열고 **CONNECT**를 눌러 **LIVE CONNECTED**를 확인합니다. 별도 중계 주소를 받았다면 입력란에 넣습니다.
2. PowerShell에서 자신의 참가자 ID, 중계 주소, 운영자가 공유한 토큰을 설정합니다. 같은 PC의 기본 중계 서버를 쓰는 경우 주소와 토큰 설정 줄을 생략합니다.

   ```powershell
   $env:GALAXY_PARTICIPANT_ID = 'alice'
   $env:GALAXY_WS = 'wss://relay.example.org/ws'
   $env:GALAXY_TOKEN = Read-Host '참가자 토큰'
   node bridge/local-bridge.mjs -- node starter/participant.mjs
   Remove-Item Env:GALAXY_TOKEN -ErrorAction SilentlyContinue
   ```

   Bash에서는 같은 변수들을 `export`로 설정하고 동일한 `node` 명령을 실행합니다.

3. 터미널에서 `[ack] reset`, `[ack] acquire`를 확인합니다. 웹 페이지의 **Cosmic Activity**에 `My First Star`와 참가자 ID가 표시됩니다. 실행을 시작할 때 보내는 `reset`은 자신의 슬롯을 초기화합니다.
4. `starter/participant.mjs`의 예시 값을 바꿔 다시 실행합니다. 다음으로 자신이 작성한 객체 풀에서 얻은 값으로 `acquire` 이벤트를 만들고 반환할 때 `release`를 전송합니다. `session.send()`는 응답을 하나씩 받도록 매번 `await`합니다.

## 슬롯의 생명 주기

- 첫 획득은 `generation: 1`입니다. `acquire`의 `data`에 `name`, `type` (`seed`, `star`, `planet` 중 하나), `color` (`#RRGGBB`), `size` (0.3~3.5)를 보냅니다.
- 반환할 때는 `{ type: 'release', poolSlotId, generation }`을 보냅니다. 같은 슬롯을 다시 획득할 때 generation을 1 증가시킵니다.
- 다른 언어로 작성할 경우 브리지 명령의 `--` 뒤에 실행 명령을 넣습니다. 프로그램은 stdin의 `init`, `ack`, `error`를 읽고 stdout으로 UTF-8 JSON 한 줄씩 전송합니다. 일반 로그는 stderr에 씁니다.
- 객체 인스턴스를 실제로 재사용하는지 참가자 코드의 테스트에서 참조 동일성으로 확인합니다. 화면의 재사용 통계는 수신한 슬롯과 generation을 기준으로 집계합니다.

## C++ 샘플 (`starter/cpp/participant.cpp`)

표준 라이브러리만 사용하는 C++17 단일 파일입니다. JSON 라이브러리가 필요 없습니다. 예제 객체 풀에서 슬롯 `1`을 얻고(generation 1), 반환한 뒤(release), 같은 슬롯을 다시 얻습니다(generation 2). 두 번째 획득에서 **같은 `Star*` 인스턴스**를 돌려받았는지 포인터 비교로 확인하고, 아니면 오류로 종료합니다. 각 이벤트를 보낸 뒤 stdin의 `ack`를 기다리며 `error`를 받으면 종료 코드 1로 끝납니다. stdout에는 JSON 이벤트만, stderr에는 사람이 읽는 로그만 씁니다.

ZIP을 푼 폴더에서 컴파일합니다. 결과 파일은 `starter/cpp/build/`에 생깁니다.

- Windows (Visual Studio 2017 이상, **x64 Native Tools Command Prompt** 또는 Developer PowerShell):

  ```powershell
  New-Item -ItemType Directory -Force starter/cpp/build | Out-Null
  cl /nologo /std:c++17 /EHsc /W4 /utf-8 /Fostarter\cpp\build\ /Festarter\cpp\build\participant.exe starter\cpp\participant.cpp
  node bridge/local-bridge.mjs -- starter/cpp/build/participant.exe
  ```

- g++ 또는 clang++ (Linux, macOS, MinGW):

  ```bash
  mkdir -p starter/cpp/build
  g++ -std=c++17 -O2 -Wall -Wextra -o starter/cpp/build/participant starter/cpp/participant.cpp
  node bridge/local-bridge.mjs -- starter/cpp/build/participant
  ```

참가자 ID, 중계 주소, 토큰은 위 2단계와 같이 환경 변수로 설정합니다. 정상 실행 시 stderr에 다음과 같이 출력되고, **Cosmic Activity**에 `Cpp Star`의 acquire, release, `Cpp Star (reused)`의 generation 2 acquire가 표시됩니다.

```text
[ack] reset - revision …
[ack] acquire - revision …
[ack] release - revision …
[pool] slot 1 generation 2, same instance: yes, instances created: 1
[ack] acquire - revision …
done: slot 1 is active at generation 2
```

`StarPool`을 자신의 객체 풀로 바꾸되 `same instance` 확인은 유지하세요. 수신 메시지 파서(`readField`)는 브리지가 보내는 평평한 `init`/`ack`/`error` 객체만 처리합니다.
