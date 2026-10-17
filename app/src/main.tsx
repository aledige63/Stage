import { createRoot } from 'react-dom/client';
import App from './App';
import { restoreAutosave, startAutosave } from './project';
import { store } from './store';
import './app.css';

restoreAutosave();
startAutosave();
document.documentElement.lang = store.getState().lang;

createRoot(document.getElementById('root')!).render(<App />);
