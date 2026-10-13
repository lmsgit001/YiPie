import { browser } from 'wxt/browser';

export function PopupApp() {
  return (
    <section className="flex flex-col gap-3 p-4">
      <h1 className="text-sm font-semibold">一瞥 Yipie</h1>
      <p className="text-xs text-(--color-ink-muted)">总结入口将在内容脚本接入后出现在这里。</p>
      <button
        type="button"
        className="rounded-md bg-(--color-brand) px-3 py-1.5 text-xs text-(--color-brand-contrast)"
        onClick={() => {
          void browser.runtime.openOptionsPage();
        }}
      >
        打开设置
      </button>
    </section>
  );
}
