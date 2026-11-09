import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitVoDuration,
  estimateCharsToCut,
  validateTtsCreation,
  splitSentences,
  trimForFit,
  countVoChars
} from './vo.mjs';

test('fitVoDuration accepts a VO that ends before the film', () => {
  const r = fitVoDuration({ duration: 28.6, at: 0.2, filmDuration: 30, tail: 0.5 });
  assert.equal(r.ok, true);
  assert.equal(r.endsAt, 28.8);
  assert.equal(r.limit, 29.5);
  assert.equal(r.overrun, 0);
});

test('fitVoDuration rejects a VO that outlasts the film', () => {
  const r = fitVoDuration({ duration: 29.6, at: 0.2, filmDuration: 30, tail: 0.5 });
  assert.equal(r.ok, false);
  assert.equal(r.endsAt, 29.8);
  assert.equal(r.limit, 29.5);
  assert.equal(r.overrun, 0.3);
});

test('fitVoDuration treats the exact limit as fitting', () => {
  const r = fitVoDuration({ duration: 29.3, at: 0.2, filmDuration: 30, tail: 0.5 });
  assert.equal(r.ok, true);
  assert.equal(r.overrun, 0);
});

test('estimateCharsToCut converts overrun into characters', () => {
  assert.equal(estimateCharsToCut({ overrun: 0, duration: 28, charCount: 140 }), 0);
  assert.equal(estimateCharsToCut({ overrun: 0.6, duration: 28, charCount: 140 }), 3);
});

test('validateTtsCreation accepts the expected response', () => {
  const creation = {
    speed: 1.3,
    topicDetail: {
      scripts: {
        data: [
          { content: '你的待办是满的。', speakerInnerId: 'chat-girl-105-cn' },
          { content: '你的时间不是。', speakerInnerId: 'chat-girl-105-cn' }
        ]
      },
      audio: { data: { audioUrl: 'https://example.com/a.mp3' } }
    }
  };
  const r = validateTtsCreation(creation, {
    text: '你的待办是满的。你的时间不是。',
    speakerId: 'chat-girl-105-cn',
    speed: 1.3
  });
  assert.equal(r.audioUrl, 'https://example.com/a.mp3');
});

test('validateTtsCreation rejects a different speaker', () => {
  const creation = {
    speed: 1.3,
    topicDetail: {
      scripts: { data: [{ content: '你好。', speakerInnerId: 'someone-else' }] },
      audio: { data: { audioUrl: 'https://example.com/a.mp3' } }
    }
  };
  assert.throws(
    () => validateTtsCreation(creation, { text: '你好。', speakerId: 'chat-girl-105-cn', speed: 1.3 }),
    /speaker mismatch/
  );
});

test('validateTtsCreation rejects a different speed', () => {
  const creation = {
    speed: 1,
    topicDetail: {
      scripts: { data: [{ content: '你好。', speakerInnerId: 'chat-girl-105-cn' }] },
      audio: { data: { audioUrl: 'https://example.com/a.mp3' } }
    }
  };
  assert.throws(
    () => validateTtsCreation(creation, { text: '你好。', speakerId: 'chat-girl-105-cn', speed: 1.3 }),
    /speed mismatch/
  );
});

test('validateTtsCreation rejects changed text', () => {
  const creation = {
    speed: 1.3,
    topicDetail: {
      scripts: { data: [{ content: '你好呀。', speakerInnerId: 'chat-girl-105-cn' }] },
      audio: { data: { audioUrl: 'https://example.com/a.mp3' } }
    }
  };
  assert.throws(
    () => validateTtsCreation(creation, { text: '你好。', speakerId: 'chat-girl-105-cn', speed: 1.3 }),
    /text mismatch/
  );
});

test('splitSentences keeps punctuation and drops blanks', () => {
  assert.deepEqual(splitSentences('甲。乙！丙？'), ['甲。', '乙！', '丙？']);
});

test('trimForFit protects a trailing CTA sentence', () => {
  const text = '第一句。第二句。第三句。免费下载，colaos.ai。';
  const r = trimForFit(text);
  assert.equal(r.removed, '第三句。');
  assert.equal(r.text, '第一句。第二句。免费下载，colaos.ai。');
});

test('trimForFit drops the last sentence when it is not a CTA', () => {
  const text = '第一句。第二句。第三句。';
  const r = trimForFit(text);
  assert.equal(r.removed, '第三句。');
  assert.equal(r.text, '第一句。第二句。');
});

test('trimForFit refuses to trim below two sentences', () => {
  assert.equal(trimForFit('第一句。第二句。'), null);
});

test('countVoChars counts CJK plus Latin tokens', () => {
  assert.equal(countVoChars('你好 Cola'), 2 + 1.5);
});
