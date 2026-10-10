// Read-aloud with the phone's built-in voice (free, works offline). Only one thing
// speaks at a time across the app.
//
// Speech engines can't seek or report time, so the player works sentence by sentence:
// "back 10 seconds" steps back about 25 words, and the sentence being read is highlighted.
// TODO(pilot): word-by-word highlighting where the platform reports word boundaries.
import * as Speech from 'expo-speech';

export const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const WORDS_PER_10S = 25;

const VOICE_LANG: Record<string, string> = { en: 'en-US', es: 'es-US' };

export function stopSpeaking() {
  return Speech.stop();
}

/** One-shot: reads text; calling again while it speaks stops it instead. */
export async function toggleSpeak(text: string, language = 'en') {
  if (await Speech.isSpeakingAsync()) return Speech.stop();
  Speech.speak(text, { language: VOICE_LANG[language] ?? 'en-US' });
}

/** Strips markdown so headings and bullets are read as plain sentences. */
export function speakableText(markdown: string) {
  return markdown
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// A period after an initial ("J. Smith") or a short form ("St.", "Dept.") doesn't end a sentence.
const SENTENCE_END = /(?<!\b(?:[A-Z]|St|Ave|Rd|Blvd|Dr|Mr|Mrs|Ms|Jr|Sr|No|Apt|Dept|Co|Inc|vs|etc|Sra|Sr)\.)(?<=[.!?])\s+(?=[A-Z0-9¿¡"“(])/;

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap(line => line.split(SENTENCE_END))
    .map(s => s.trim())
    .filter(Boolean);
}

/** Index to restart from for "back 10 seconds": about 25 words, adjusted for speed. */
export function backTenSeconds(sentences: string[], current: number, rate: number) {
  let words = 0;
  let i = current;
  const target = WORDS_PER_10S * rate;
  while (i > 0 && words < target) {
    i--;
    words += sentences[i].split(/\s+/).length;
  }
  return i;
}

export class SentencePlayer {
  private index = 0;
  private playing = false;
  private token = 0;   // ignores onDone from a sentence we already stopped

  constructor(
    private sentences: string[],
    private language: string,
    private onChange: (state: { index: number; playing: boolean }) => void,
    private rate = 1,
  ) {}

  get state() { return { index: this.index, playing: this.playing }; }

  play() {
    if (!this.sentences.length) return;
    if (this.index >= this.sentences.length) this.index = 0;
    this.playing = true;
    this.speakCurrent();
  }

  pause() {
    this.playing = false;
    this.token++;
    void Speech.stop();
    this.emit();
  }

  back() {
    this.jump(backTenSeconds(this.sentences, this.index, this.rate));
  }

  jump(index: number) {
    this.index = Math.max(0, Math.min(index, this.sentences.length - 1));
    if (this.playing) {
      this.token++;
      void Speech.stop().then(() => this.speakCurrent());
    } else {
      this.emit();
    }
  }

  setRate(rate: number) {
    this.rate = rate;
    if (this.playing) this.jump(this.index);   // restart the sentence at the new speed
  }

  dispose() {
    this.playing = false;
    this.token++;
    void Speech.stop();
  }

  private speakCurrent() {
    const token = ++this.token;
    this.emit();
    Speech.speak(this.sentences[this.index], {
      language: VOICE_LANG[this.language] ?? 'en-US',
      rate: this.rate,
      onDone: () => {
        if (token !== this.token || !this.playing) return;
        this.index++;
        if (this.index < this.sentences.length) this.speakCurrent();
        else { this.playing = false; this.index = 0; this.emit(); }
      },
      onError: () => { if (token === this.token) { this.playing = false; this.emit(); } },
    });
  }

  private emit() { this.onChange(this.state); }
}
