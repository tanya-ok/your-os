import { useEffect, useRef } from 'react';

export default function PreviewDialog({ preview, busy, error, onClose, onApply, t }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = ref.current;
    dialog?.focus();
    function keydown(event) {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const controls = [
        ...dialog.querySelectorAll('button:not(:disabled), textarea, [tabindex="0"]'),
      ];
      if (!controls.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [busy, onClose]);
  return (
    <div className="modal-backdrop">
      <section
        className="preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        aria-describedby="preview-description"
        tabIndex={-1}
        ref={ref}
      >
        <div className="dialog-heading">
          <span className="eyebrow">{t('previewEyebrow')}</span>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('close')}
          >
            ×
          </button>
        </div>
        <h2 id="preview-title">{t('previewTitle')}</h2>
        <p id="preview-description">{t('previewDescription')}</p>
        <div className="preview-file">
          <span>{preview.label}</span>
          <code>{preview.path}</code>
        </div>
        <div className="diff-grid">
          <div>
            <h3>{t('before')}</h3>
            <textarea
              readOnly
              rows={12}
              aria-label={t('before')}
              value={preview.before || t('emptyFile')}
            />
          </div>
          <div>
            <h3>{t('after')}</h3>
            <textarea
              readOnly
              rows={12}
              aria-label={t('after')}
              value={preview.after || t('emptyFile')}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <footer className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button type="button" className="button primary" onClick={onApply} disabled={busy}>
            {busy ? t('applying') : t('applyChange')} <span aria-hidden="true">↗</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
