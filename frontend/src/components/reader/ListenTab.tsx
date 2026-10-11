import { useEffect, useState } from "react";
import { parseMarkdown, speakAction } from "../../lib/reader";
import type { ReadingResult } from "../../types/reader";

/** Reads the simple version and the to-dos out loud with the browser's own voices. The
 * words are in the client's language, so the voice must match it. */
export default function ListenTab({ result, language }: { result: ReadingResult; language: string }) {
  const lang = language === "es" ? "es" : "en";
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) setVoice(voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null);
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pick);
      window.speechSynthesis.cancel();
    };
  }, [supported, lang]);

  function speak(text: string) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? lang;
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  if (!supported) {
    return <p className="hint">This browser can't read out loud. Try the Simple version tab instead.</p>;
  }
  if (voice === null) {
    return (
      <p className="hint">
        {lang === "es"
          ? "This device has no Spanish voice, so it can't read this paper out loud. Try the Simple version tab instead."
          : "This device has no English voice, so it can't read this paper out loud. Try the Simple version tab instead."}
      </p>
    );
  }

  const simpleText = parseMarkdown(result.simplified.markdown).map((b) => b.text).join(". ");
  const todoText = result.actions.map(speakAction).join(" ");

  return (
    <div className="listen-tab">
      <button type="button" className="dash-btn" onClick={() => speak(simpleText)} disabled={voice === undefined}>
        Read the simple version
      </button>
      {result.actions.length > 0 && (
        <button type="button" className="dash-btn" onClick={() => speak(todoText)} disabled={voice === undefined}>
          Read my to-do list
        </button>
      )}
      {speaking && (
        <button type="button" className="dash-btn dash-btn-quiet" onClick={stop}>
          Stop
        </button>
      )}
    </div>
  );
}
