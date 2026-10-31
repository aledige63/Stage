import { createRoot } from 'react-dom/client';
import App from './App';
import { restoreAutosave, startAutosave } from './project';
import { store } from './store';
import { clearHistory } from './history';
import './app.css';

restoreAutosave();
// il ripristino non è una modifica da annullare
clearHistory();
startAutosave();
document.documentElement.lang = store.getState().lang;

createRoot(document.getElementById('root')!).render(<App />);
