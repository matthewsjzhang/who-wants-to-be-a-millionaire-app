// WP6: circular countdown for clock mode.
import { h } from '../dom';

export interface TimerRing {
  el: HTMLElement;
  update(timeLeftMs: number, totalMs: number): void;
}

const R = 44;
const C = 2 * Math.PI * R;
const NS = 'http://www.w3.org/2000/svg';

export function timerRing(): TimerRing {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(NS, 'circle');
  const arc = document.createElementNS(NS, 'circle');
  for (const c of [track, arc]) {
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', String(R));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '8');
  }
  track.setAttribute('class', 'timer-track');
  arc.setAttribute('class', 'timer-arc');
  arc.setAttribute('stroke-dasharray', String(C));
  arc.setAttribute('transform', 'rotate(-90 50 50)');
  svg.append(track, arc);
  const label = h('span', { class: 'timer-label' }, '0');
  const el = h(
    'div',
    { class: 'timer-ring', role: 'timer', 'aria-label': 'Time remaining' },
    svg,
    label,
  );
  let lastSec = -1;
  return {
    el,
    update(timeLeftMs, totalMs) {
      const left = Math.max(0, timeLeftMs);
      const frac = totalMs > 0 ? Math.min(1, left / totalMs) : 0;
      arc.setAttribute('stroke-dashoffset', String(C * (1 - frac)));
      const sec = Math.ceil(left / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        label.textContent = String(sec);
      }
      el.classList.toggle('timer-ring--urgent', sec <= 10);
    },
  };
}
