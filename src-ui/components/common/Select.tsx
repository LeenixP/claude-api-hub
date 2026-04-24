import { useState, useRef, useEffect, useCallback } from 'preact/hooks';

interface Option {
  value: string;
  label: string;
  group?: string;
}

interface SelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
}

export function Select({ value, options, onChange, placeholder = 'Select...', error }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [kbIdx, setKbIdx] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Determine drop direction + reset keyboard index on open
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setDropUp(spaceBelow < 280 && spaceAbove > spaceBelow);
    setKbIdx(-1);
  }, [open]);

  // Prevent scroll leak from dropdown list
  const handleListWheel = useCallback((e: WheelEvent) => {
    const el = listRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atTop = scrollTop <= 0 && e.deltaY < 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
    if (atTop || atBottom) e.preventDefault();
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setKbIdx(i => {
          const next = Math.min(i + 1, options.length - 1);
          scrollToIdx(next);
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setKbIdx(i => {
          const next = Math.max(i - 1, 0);
          scrollToIdx(next);
          return next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (kbIdx >= 0 && kbIdx < options.length) {
          onChange(options[kbIdx].value);
          setOpen(false);
        }
        break;
    }
  }, [open, kbIdx, options, onChange]);

  const scrollToIdx = (idx: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-idx]');
    const el = items[idx] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest' });
  };

  const handleToggle = useCallback(() => setOpen(v => !v), []);

  const handleSelect = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
  }, [onChange]);

  // Build grouped options
  const groups = new Map<string, Option[]>();
  const ungrouped: Option[] = [];
  for (const o of options) {
    if (o.group) {
      if (!groups.has(o.group)) groups.set(o.group, []);
      groups.get(o.group)!.push(o);
    } else {
      ungrouped.push(o);
    }
  }

  let itemIdx = 0;
  const renderItem = (o: Option) => {
    const idx = itemIdx++;
    const isActive = o.value === value;
    const isKb = idx === kbIdx;
    return (
      <div key={o.value} data-idx={idx}
        onClick={() => handleSelect(o.value)}
        style={`padding:10px 14px;cursor:pointer;font-size:14px;border-radius:6px;margin:2px 4px;${
          isKb ? 'background:var(--color-surface-hover);' : ''
        }${isActive ? 'color:var(--color-primary);font-weight:600;' : 'color:var(--color-text);'}`}>
        {o.label}
      </div>
    );
  };

  const renderList = () => {
    const items: preact.JSX.Element[] = [];
    for (const o of ungrouped) items.push(renderItem(o));
    for (const [group, opts] of groups) {
      items.push(
        <div key={`g-${group}`} style="padding:8px 14px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-muted)">
          {group}
        </div>
      );
      for (const o of opts) items.push(renderItem(o));
    }
    return items;
  };

  const listStyle = dropUp
    ? 'position:absolute;bottom:calc(100% + 4px);left:0;right:0;max-height:260px;overflow-y:auto;background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:10px;box-shadow:var(--shadow-card-hover);z-index:50;padding:4px 0'
    : 'position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:260px;overflow-y:auto;background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:10px;box-shadow:var(--shadow-card-hover);z-index:50;padding:4px 0';

  return (
    <div ref={rootRef} style="position:relative;user-select:none" onKeyDown={handleKeyDown} tabindex="0"
      onfocusout={(e: FocusEvent) => {
        if (rootRef.current && !rootRef.current.contains(e.relatedTarget as Node)) setOpen(false);
      }}>
      <div ref={triggerRef} onClick={handleToggle}
        style={`display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 14px;border-radius:10px;font-size:14px;border:1px solid ${error ? 'var(--color-danger)' : open ? 'var(--color-primary)' : 'var(--color-border-strong)'};background:var(--color-bg);color:var(--color-text);cursor:pointer;transition:border-color 0.15s;line-height:1.5;${open ? 'box-shadow:0 0 0 3px var(--color-primary-glow);' : ''}`}>
        <span style={selected ? '' : 'color:var(--color-text-muted)'}>{selected ? selected.label : placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          style={`transition:transform 0.15s;transform:rotate(${open ? 180 : 0}deg);flex-shrink:0`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div ref={listRef} style={listStyle} onWheel={handleListWheel}>
          {options.length === 0 ? (
            <div style="padding:12px 14px;font-size:13px;color:var(--color-text-muted)">No options</div>
          ) : renderList()}
        </div>
      )}
    </div>
  );
}
