import type { CSSProperties } from 'react';
import { coords4 } from '~/lib/grid-coords';
import { loaderStyle, type LoaderProps } from '~/lib/loader-props';
import styles from './gradient-descent.module.css';

export function GradientDescent(props: LoaderProps = {}) {
  return (
    <div
      className={`loader ${styles.loader}${props.className ? ` ${props.className}` : ''}`}
      style={loaderStyle(props, { '--grid-size': 4 })}
      role='status'
      aria-label={props['aria-label'] ?? 'Loading'}
    >
      {coords4.map((c) => (
        <span
          key={c.i}
          className='dot'
          style={{ '--diag': c.diag } as CSSProperties}
        />
      ))}
    </div>
  );
}
