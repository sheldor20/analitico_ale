import type { ReactNode } from 'react';

/** Keeps reference information available without competing with the task. */
export default function SecondaryInfo({title = 'Como interpretar', children, open}: {title?: string; children: ReactNode; open?: boolean}) {
  return <details className="secondary-info" open={open}><summary>{title}</summary><div>{children}</div></details>;
}
