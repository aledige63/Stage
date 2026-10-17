import { useEffect, useRef } from 'react';
import { Engine } from './engine/Engine';
import { Panel } from './ui/Panel';
import { Timeline } from './ui/Timeline';
import { ProjectBar } from './ui/ProjectBar';
import { useApp } from './store';
import { useT } from './i18n';

export default function App() {
  const shotArea = useRef<HTMLDivElement>(null);
  const shotFrame = useRef<HTMLDivElement>(null);
  const shotCanvas = useRef<HTMLCanvasElement>(null);
  const dirArea = useRef<HTMLDivElement>(null);
  const dirCanvas = useRef<HTMLCanvasElement>(null);
  const aspect = useApp(s => s.aspect);
  const thirds = useApp(s => s.thirds);
  const center = useApp(s => s.center);
  const safe = useApp(s => s.safe);
  const t = useT();

  useEffect(() => {
    const engine = new Engine({
      shotArea: shotArea.current!,
      shotFrame: shotFrame.current!,
      shotCanvas: shotCanvas.current!,
      dirArea: dirArea.current!,
      dirCanvas: dirCanvas.current!,
    });
    return () => engine.dispose();
  }, []);

  return (
    <div className="app">
      <Panel />
      <div className="workspace">
        <ProjectBar />
        <main className="views">
          <section className="view">
            <header>{t('shot.title')} <span>{aspect}</span></header>
            <div className="shot-area" ref={shotArea} tabIndex={0}>
              <div className="shot-frame" ref={shotFrame}>
                <canvas ref={shotCanvas} />
                {thirds && (
                  <div className="thirds"><i /><i /><i /><i /></div>
                )}
                {center && <div className="center-cross" />}
                {safe && (
                  <>
                    <div className="safe action"><span>{t('safe.action')}</span></div>
                    <div className="safe title"><span>{t('safe.title')}</span></div>
                  </>
                )}
              </div>
            </div>
            <footer className="hint">{t('shot.hint')}</footer>
          </section>
          <section className="view director">
            <header>{t('dir.title')}</header>
            <div className="dir-area" ref={dirArea}>
              <canvas ref={dirCanvas} />
            </div>
            <footer className="hint">{t('dir.hint')}</footer>
          </section>
        </main>
        <Timeline />
      </div>
    </div>
  );
}
