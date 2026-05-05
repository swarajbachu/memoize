import type { CSSProperties } from 'react';
import { coords5 } from '~/lib/grid-coords';
import { loaderStyle, type LoaderProps } from '~/lib/loader-props';
import styles from './token-stream.module.css';

export function TokenStream(props: LoaderProps = {}) {
  return (
    <div
      className={`loader ${styles.loader}${props.className ? ` ${props.className}` : ''}`}
      style={loaderStyle(props)}
      role='status'
      aria-label={props['aria-label'] ?? 'Loading'}
    >
      {coords5.map((c) => (
        <span
          key={c.i}
          className='dot'
          style={{ '--col': c.col } as CSSProperties}
        />
      ))}
    </div>
  );
}
