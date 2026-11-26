import { openSession } from './session.mjs';

const session = await openSession();
try {
  console.error(`연결 완료: ${session.participantId}`);

  // TODO: 자신의 객체 풀에서 객체를 얻고 반환하는 코드를 작성하세요.
  // 전송 형식 확인용 이벤트입니다. 자신의 풀에서 만든 값으로 교체하세요.
  await session.send({ type: 'reset' });
  await session.send({
    type: 'acquire',
    poolSlotId: '1',
    generation: 1,
    data: { name: 'My First Star', type: 'star', color: '#5dcaff', size: 1.2 },
  });
} finally {
  session.close();
}
