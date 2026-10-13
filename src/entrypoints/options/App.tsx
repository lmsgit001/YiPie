import { useEffect, useState } from 'react';

import {
  PanelFontSize,
  SummaryInputExceedBehaviour,
  ThemeMode,
  type GeneralSettings,
} from '@/contract';
import { loadGeneralSettings, saveGeneralSettings } from '@/platform/rpc/client';

const THEME_LABEL: Record<GeneralSettings['theme'], string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

const FONT_SIZE_LABEL: Record<GeneralSettings['panelFontSize'], string> = {
  small: '小',
  medium: '中',
  large: '大',
};

const EXCEED_LABEL: Record<GeneralSettings['summaryInputExceedBehaviour'], string> = {
  front: '保留开头',
  middle: '保留开头和结尾',
  back: '保留结尾',
  nothing: '不处理（交给服务商拒绝）',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-6 py-3">
      <span className="text-sm text-(--color-ink-muted)">{label}</span>
      {children}
    </label>
  );
}

export function App() {
  const [settings, setSettings] = useState<GeneralSettings | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;

    loadGeneralSettings()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, []);

  const update = (patch: Partial<GeneralSettings>) => {
    // Optimistic: the background returns the merged record, so a rejected write
    // is corrected by the next render rather than leaving the control lying.
    setSettings((current) => (current ? { ...current, ...patch } : current));
    saveGeneralSettings(patch)
      .then(setSettings)
      .catch(() => setStatus('error'));
  };

  if (status === 'loading') {
    return <main className="p-8 text-sm text-(--color-ink-muted)">正在加载设置…</main>;
  }

  if (status === 'error' || !settings) {
    return <main className="p-8 text-sm text-(--color-ink-muted)">设置读取失败，请刷新重试。</main>;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">一瞥 Yipie</h1>
        <p className="mt-1 text-sm text-(--color-ink-muted)">
          用你自己的模型 API Key 总结网页。纯本地运行，无后端，无遥测。
        </p>
      </header>

      <section className="divide-y divide-(--color-line) rounded-lg border border-(--color-line) bg-(--color-canvas-muted) px-6">
        <Field label="主题">
          <select
            className="rounded-md border border-(--color-line) bg-(--color-canvas) px-2 py-1 text-sm"
            value={settings.theme}
            onChange={(event) => update({ theme: ThemeMode.parse(event.target.value) })}
          >
            {ThemeMode.options.map((option) => (
              <option key={option} value={option}>
                {THEME_LABEL[option]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="面板字号">
          <select
            className="rounded-md border border-(--color-line) bg-(--color-canvas) px-2 py-1 text-sm"
            value={settings.panelFontSize}
            onChange={(event) => update({ panelFontSize: PanelFontSize.parse(event.target.value) })}
          >
            {PanelFontSize.options.map((option) => (
              <option key={option} value={option}>
                {FONT_SIZE_LABEL[option]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="正文超出模型上限时">
          <select
            className="rounded-md border border-(--color-line) bg-(--color-canvas) px-2 py-1 text-sm"
            value={settings.summaryInputExceedBehaviour}
            onChange={(event) =>
              update({
                summaryInputExceedBehaviour: SummaryInputExceedBehaviour.parse(event.target.value),
              })
            }
          >
            {SummaryInputExceedBehaviour.options.map((option) => (
              <option key={option} value={option}>
                {EXCEED_LABEL[option]}
              </option>
            ))}
          </select>
        </Field>
      </section>
    </main>
  );
}
