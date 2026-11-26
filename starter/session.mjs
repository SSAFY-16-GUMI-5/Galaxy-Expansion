import { createInterface } from 'node:readline';

export async function openSession() {
  const input = createInterface({ input: process.stdin });
  const replies = input[Symbol.asyncIterator]();
  const close = () => {
    input.close();
    process.stdin.pause();
  };

  async function readMessage() {
    const reply = await replies.next();
    if (reply.done) throw new Error('브리지 연결이 종료되었습니다.');
    return JSON.parse(reply.value);
  }

  try {
    const init = await readMessage();
    if (init.type !== 'init') throw new Error('브리지의 init 메시지가 필요합니다.');

    return {
      participantId: init.participantId,
      async send(event) {
        process.stdout.write(JSON.stringify(event) + '\n');
        const reply = await readMessage();
        if (reply.type === 'error') throw new Error(reply.message);
        if (reply.type !== 'ack' || reply.action !== event.type) {
          throw new Error('이벤트에 대한 ACK를 받지 못했습니다.');
        }
        console.error(`[ack] ${reply.action} · revision ${reply.revision}`);
        return reply;
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
