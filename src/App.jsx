import html2pdf from 'html2pdf.js'; // <--- AJOUTER CETTE LIGNE
import React, { useState, useEffect, useMemo } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, Lock, FileText, Plus, Search, LogOut, 
  AlertTriangle, CheckCircle, Clock, Eye, Download, 
  FileCheck, Settings, Upload, RefreshCw, AlertOctagon, Loader, X, Wrench
} from 'lucide-react';

// --- MODIFICATION ICI : On importe auth et db depuis votre fichier firebase.js ---
import { auth, db } from './firebase'; 

// On garde les fonctions utilitaires de Firebase Auth dont on a besoin
import { 
  signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut 
} from 'firebase/auth';

// On garde les fonctions utilitaires de Firestore dont on a besoin
import { 
  collection, addDoc, query, onSnapshot, 
  doc, updateDoc, orderBy, serverTimestamp, setDoc, getDoc 
} from 'firebase/firestore';

// --- CONFIGURATION FIREBASE ---
// Les lignes qui plantaient ont été supprimées.
// On récupère juste l'ID de l'app (on sécurise aussi __app_id pour éviter un autre crash)
const appId = (typeof __app_id !== 'undefined') ? __app_id : 'iamonjob-mvp';

// --- FONCTIONS UTILITAIRES ... (la suite reste identique)

const generateRef = () => `IAM-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}-${Math.floor(Math.random()*0xFFFFFF).toString(16).toUpperCase().padStart(6,'0')}`;

const generateDefaultYaml = (firstName, targetRole) => `---
doc_title: "Dossier de compétences"
date: "${new Date().toLocaleDateString("fr-FR")}"
candidat: "${(firstName || "Anonymisé").replace(/"/g, "")}"
poste_vise: "${(targetRole || "").replace(/"/g, "")}"
---

`;

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const stripYamlFrontMatter = (md) => {
  const m = md.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  return m ? md.slice(m[0].length) : md;
};

const parseInline = (text) => {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/✓/g, '<span class="check">✓</span>');
  return s;
};

const renderTable = (tableLines) => {
  const cleanRow = (line) => {
    const raw = line.trim();
    const inner = raw.replace(/^\||\|$/g, '');
    return inner.split('|').map(c => c.trim());
  };

  const headers = cleanRow(tableLines[0]);
  const bodyRows = tableLines.slice(2).map(cleanRow);

  const thead = `<thead><tr>${headers.map(h => `<th>${parseInline(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${bodyRows.map(row => {
    while(row.length < headers.length) row.push('');
    return `<tr>${row.map(cell => `<td>${parseInline(cell)}</td>`).join('')}</tr>`;
  }).join('')}</tbody>`;

  return `<table>${thead}${tbody}</table>`;
};

const markdownToHtml = (md) => {
  if (!md) return "";
  
  // Nettoyage des listes cassées (ex: "* \n Texte")
  let cleanedMd = md.replace(/^(\s*[\*\-])\s*\n\s*/gm, '$1 ');
  
  const lines = stripYamlFrontMatter(cleanedMd).split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();

    // Blocs ::: (table-gap, box...)
    if (trim.match(/^:::\s*([\w-]+)/)) {
      const cls = trim.match(/^:::\s*([\w-]+)/)[1];
      out.push(`<div class="${cls}">`);
      i++;
      continue;
    }
    if (trim.match(/^:::/)) {
      out.push('</div>');
      i++;
      continue;
    }

    // Titres
    if (trim.startsWith('# ')) { out.push(`<h1>${parseInline(trim.slice(2))}</h1>`); i++; continue; }
    if (trim.startsWith('## ')) { out.push(`<h2>${parseInline(trim.slice(3))}</h2>`); i++; continue; }
    if (trim.startsWith('### ')) { out.push(`<h3>${parseInline(trim.slice(4))}</h3>`); i++; continue; }

    // Tableaux
    if (trim.includes('|') && i + 1 < lines.length && lines[i+1].trim().match(/^[:\-\| ]+$/)) {
      const tableLines = [];
      tableLines.push(lines[i]);
      tableLines.push(lines[i+1]);
      i += 2;
      while (i < lines.length && lines[i].trim().includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(renderTable(tableLines));
      continue;
    }

    // Listes
    if (trim.match(/^[\*\-]\s+/)) {
      out.push('<ul>');
      while(i < lines.length && lines[i].trim().match(/^[\*\-]\s+/)) {
        let content = lines[i].trim().replace(/^[\*\-]\s+/, '');
        out.push(`<li>${parseInline(content)}</li>`);
        i++;
      }
      out.push('</ul>');
      continue;
    }

    // Blockquotes
    if (trim.startsWith('> ')) {
      out.push(`<div class="box">${parseInline(trim.slice(2))}</div>`);
      i++;
      continue;
    }

    // Paragraphes
    if (trim.length > 0) {
      out.push(`<p>${parseInline(trim)}</p>`);
    }
    i++;
  }

  return out.join('\n').replace(/\[À COMPLETER\]/g, '<span style="background:#ffcccc;color:#cc0000;font-weight:bold;padding:2px;">[À COMPLETER]</span>');
};

const validateMarkdown = (content) => {
  const errors = [];
  if (!content) return ["Contenu vide"];
  if (!content.trim().startsWith('---')) errors.push("ERREUR: Front-matter YAML manquant.");
  if (content.includes('[À COMPLETER]')) errors.push("ERREUR: [À COMPLETER] présent.");
  return errors;
};

// --- TEMPLATE & CSS (MODELE PDF FIDÈLE) ---

const TEMPLATE_HTML = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>$doc_title$</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Open+Sans:wght@400;600&display=swap');
    $css_content$
  </style>
</head>
<body>

<div class="page cover-page">
  <div class="header-row">
    <div class="header-left">
      <div class="badge-perso">100%<br>personnalisé</div>
      <div class="logo-iam">IAMon Job</div>
    </div>
    <div class="header-right">
      <div class="logo-cbe">
        <strong>COMITÉ</strong><br>DE BASSIN<br>D'EMPLOI<br><span class="sud94">sud 94</span>
      </div>
    </div>
  </div>

  <div class="cover-body">
    <h1 class="main-title">DIAGNOSTIC EMPLOI<br>ET PLAN D'ACTION</h1>
    <div class="meta-info">
      Rédigé le $date$, pour <strong>$candidat$</strong>
    </div>
    <div class="intro-box">
      <p>Vous tenez entre vos mains un document unique, conçu pour vous accompagner dans la construction et l'évolution de votre projet professionnel.</p>
      <p>Ce diagnostic est le fruit d'une collaboration entre la puissance de l'intelligence artificielle et l'expertise humaine de nos conseillers en emploi.</p>
    </div>
  </div>
  
  <div class="footer-cover"></div>
</div>

<div class="page-break-visual"></div>

<div class="content-wrapper">
  <div class="page-header">
    <div class="ph-left">
      <div class="ph-badge">100% personnalisé</div>
      <div class="ph-logo">IAMon Job</div>
    </div>
    <div class="ph-right">
      DIAGNOSTIC ET PLAN D'ACTION
    </div>
  </div>

  <div class="markdown-content">
    $body$
  </div>

  <div class="page-footer">
    COMITÉ DE BASSIN D'EMPLOI sud 94
  </div>
</div>

</body>
</html>
`;

const TEMPLATE_CSS = `
:root {
  --primary: #006d6f;
  --text-dark: #222;
  --bg-zebra: #e6f2f1;
}

body {
  margin: 0;
  padding: 0;
  background-color: #525659;
  font-family: Arial, Helvetica, sans-serif;
  color: var(--text-dark);
  font-size: 11pt;
  line-height: 1.5;
}

.page, .content-wrapper {
  width: 210mm;
  min-height: 297mm;
  background: white;
  margin: 0 auto 1cm auto;
  padding: 2cm 2.5cm;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 10px rgba(0,0,0,0.3);
}

.cover-page { display: flex; flex-direction: column; }
.header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3cm; }

.badge-perso {
  font-weight: bold; font-size: 9pt; text-transform: uppercase; color: #666; line-height: 1.2; margin-bottom: 5px;
}
.logo-iam {
  font-family: "Arial Black", Arial, sans-serif; font-weight: 900; font-size: 26pt; color: #333; letter-spacing: -1px;
}

.header-right { border-left: 5px solid var(--primary); padding-left: 12px; }
.logo-cbe { font-size: 10pt; line-height: 1.3; color: #333; text-align: left; }
.sud94 { color: var(--primary); font-weight: bold; font-size: 11pt; }

.cover-body { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; }
.main-title {
  font-weight: bold; font-size: 30pt; color: var(--primary); text-transform: uppercase; line-height: 1.2; margin-bottom: 1.5cm;
}
.meta-info { font-size: 15pt; color: #333; margin-bottom: 3cm; }

.intro-box {
  text-align: left; margin: 0 auto; width: 90%; font-size: 13pt; color: #333;
  padding: 15px;
  background-color: #f9f9f9;
  border-left: 8px solid var(--primary);
  border-radius: 0 10px 10px 0;
}
.intro-box p { margin-bottom: 1em; }

.page-header {
  display: flex; justify-content: space-between; align-items: flex-end;
  border-bottom: 3px solid var(--primary); padding-bottom: 10px; margin-bottom: 2cm;
}
.ph-badge { font-size: 8pt; text-transform: uppercase; font-weight: bold; color: #666; line-height: 1.2; }
.ph-logo { font-family: "Arial Black", sans-serif; font-weight: 900; font-size: 13pt; color: #333; }
.ph-right { font-weight: bold; font-size: 13pt; color: var(--primary); text-transform: uppercase; }

.page-footer {
  position: absolute; bottom: 1.5cm; right: 2.5cm;
  font-weight: bold; font-size: 9pt; color: var(--primary); text-transform: uppercase; text-align: right;
}

h1 {
  font-weight: bold; font-size: 22pt; color: var(--primary); text-transform: uppercase;
  margin-top: 1.5cm; margin-bottom: 1cm;
  border-bottom: 1px solid #ddd; padding-bottom: 10px;
}

h2 {
  font-family: Arial, sans-serif;
  font-weight: bold;
  font-size: 13pt;
  background-color: var(--primary);
  color: white;
  padding: 8px 12px;
  display: inline-block;
  margin-top: 1.5em; margin-bottom: 1em;
  border-radius: 2px;
  text-transform: uppercase;
  box-shadow: 2px 2px 0px rgba(0,0,0,0.1);
}

h3 {
  font-weight: bold; font-size: 12pt; color: var(--primary);
  margin-top: 1em; margin-bottom: 0.5em;
  border-left: 5px solid var(--primary); padding-left: 10px;
}

ul { 
  padding-left: 1.5em; 
  margin-bottom: 1em; 
  list-style-type: disc; 
}
li { 
  margin-bottom: 0.5em; 
  text-align: justify;
}
li p { margin: 0; display: inline; }

p { margin-bottom: 1em; text-align: justify; }

table {
  width: 100%; 
  border-collapse: collapse; 
  margin: 1.5em 0;
  font-size: 10pt; 
  table-layout: auto;
  box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}

th {
  background-color: var(--primary);
  color: white; 
  font-weight: bold;
  padding: 10px 12px; 
  text-align: left;
  border: 1px solid var(--primary);
  text-transform: uppercase; 
  font-size: 9pt;
}

td {
  border: 1px solid #ddd;
  padding: 10px 12px; 
  vertical-align: top;
}

tbody tr:nth-child(even) {
  background-color: var(--bg-zebra); 
}

.check {
  color: var(--primary); font-weight: 900; font-size: 14pt;
}

.table-gap {
  margin: 2em 0;
}

.box {
  background: #f9f9f9; 
  border-left: 5px solid var(--primary);
  padding: 1em; 
  margin: 1em 0; 
  font-style: italic;
  color: #555;
}

.page-break-visual { height: 20px; background: #525659; }
`;

// --- COMPOSANTS UI ---

const Button = ({ children, onClick, variant = 'primary', icon: Icon, disabled }) => {
  const styles = {
    primary: "bg-teal-700 text-white hover:bg-teal-800",
    secondary: "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200",
    success: "bg-green-600 text-white hover:bg-green-700",
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded font-medium flex items-center gap-2 transition-colors ${styles[variant] || styles.primary} disabled:opacity-50`}>
      {Icon && <Icon size={18} />} {children}
    </button>
  );
};

const Badge = ({ status }) => {
  const styles = { draft: "bg-gray-100 text-gray-600", validated: "bg-teal-50 text-teal-700", pdf_ready: "bg-green-50 text-green-700", pdf_generating: "bg-amber-50 text-amber-800" };
  const labels = { draft: "Brouillon", validated: "Validé", pdf_ready: "PDF prêt", pdf_generating: "Génération..." };
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.draft}`}>{labels[status] || status}</span>;
};

// --- ÉCRANS ---

const LoginScreen = ({ onLogin }) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full border border-slate-200 text-center">
      <div className="flex justify-center mb-6"><div className="bg-teal-700 p-3 rounded-xl"><FileText className="text-white w-8 h-8" /></div></div>
      <h1 className="text-2xl font-bold text-slate-800 mb-8">IAMonJob</h1>
      <Button className="w-full justify-center" onClick={() => onLogin({ email: "user@iam.fr", role: "counselor" })}>Se connecter</Button>
    </div>
  </div>
);

const FolderList = ({ folders, onCreate, onSelect }) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <h2 className="text-2xl font-bold text-slate-800">Dossiers</h2>
      <Button onClick={onCreate} icon={Plus}>Nouveau</Button>
    </div>
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
          <tr><th className="px-6 py-3">Réf</th><th className="px-6 py-3">Candidat</th><th className="px-6 py-3">Poste</th><th className="px-6 py-3">Statut</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {folders.map((f) => (
            <tr key={f.id} onClick={() => onSelect(f)} className="hover:bg-slate-50 cursor-pointer">
              <td className="px-6 py-4 font-mono">{f.ref}</td>
              <td className="px-6 py-4 font-bold">{f.firstName || "Anonyme"}</td>
              <td className="px-6 py-4">{f.targetRole}</td>
              <td className="px-6 py-4"><Badge status={f.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const FolderDetail = ({ folder, onBack, onSave, onGenerate }) => {
  const [data, setData] = useState({ ...folder });
  const [errors, setErrors] = useState([]);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!data.markdown) {
      setData((d) => ({
        ...d,
        markdown: generateDefaultYaml(d.firstName, d.targetRole) +
`# Analyse du CV

[À COMPLETER]

## Compétences Clés (Titre Encadré)

::: table-gap
| Compétence | Niveau | Preuve |
|---|---|---|
| Gestion de Projet | Expert | ✓ Budget 50k€ |
| Management | Avancé | ✓ Équipe de 10 |
| Anglais | Intermédiaire | TOEIC 750 |
:::
`
      }));
    }
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let content = String(ev.target?.result || "");
      if (!content.trim().startsWith("---")) {
        content = generateDefaultYaml(data.firstName, data.targetRole) + content;
      }
      setData((prev) => ({ ...prev, markdown: content }));
    };
    reader.readAsText(file);
  };

  const previewHtml = useMemo(() => {
    const body = markdownToHtml(data.markdown);
    
    // Extraction simple du YAML pour le titre
    let candidat = data.firstName || "Anonymisé";

    return TEMPLATE_HTML
      .replace("$css_content$", TEMPLATE_CSS)
      .replace(/\$doc_title\$/g, "Dossier Compétences")
      .replace(/\$date\$/g, new Date().toLocaleDateString("fr-FR"))
      .replace(/\$candidat\$/g, escapeHtml(candidat))
      .replace(/\$poste_vise\$/g, data.targetRole || "")
      .replace("$body$", body);
  }, [data.markdown, data.firstName, data.targetRole]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex justify-between bg-white p-4 rounded shadow border border-slate-200">
        <div className="flex gap-4 items-center">
          <button onClick={onBack} className="text-slate-600 hover:text-slate-900">←</button>
          <h1 className="font-bold">{data.ref}</h1>
          <Badge status={data.status} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPreview(!preview)} className="px-3 py-1 bg-slate-100 rounded hover:bg-slate-200">
            {preview ? "Éditer" : "Aperçu"}
          </button>
          {data.status === 'pdf_ready' ? 
            <Button variant="success" icon={Download}>Télécharger</Button> : 
            <Button onClick={() => {
              const errs = validateMarkdown(data.markdown);
              setErrors(errs);
              if (!errs.length) onSave({ ...data, status: "validated" });
            }} icon={FileCheck}>Valider</Button>
          }
          {data.status === "validated" && <Button icon={Settings} onClick={() => onGenerate(data.id)}>Générer PDF</Button>}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 p-3 rounded text-red-800 text-sm border border-red-200">
          <b>Erreurs :</b> {errors.join(', ')}
        </div>
      )}

      <div className="flex-1 bg-white rounded shadow border border-slate-200 overflow-hidden flex flex-col">
        {preview ? (
          <div className="flex-1 bg-slate-600 p-8 overflow-auto flex justify-center">
            <iframe title="Preview" srcDoc={previewHtml} className="bg-white shadow-2xl" 
              style={{ width: "210mm", minHeight: "297mm", height: "calc(100% - 20px)", border: "none" }} 
            />
          </div>
        ) : (
          <div className="flex-1 flex">
            <div className="w-64 bg-slate-50 border-r p-4">
              <label className="block text-xs font-bold text-slate-500 mb-1">Candidat</label>
              <input className="w-full border p-2 rounded mb-4" value={data.firstName || ""} onChange={(e) => setData({ ...data, firstName: e.target.value })} />
              <label className="flex items-center gap-2 text-blue-600 text-sm cursor-pointer hover:underline">
                <Upload size={14} /> Importer MD <input type="file" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            <textarea className="flex-1 p-6 font-mono text-sm resize-none focus:outline-none" value={data.markdown || ""} onChange={(e) => setData({ ...data, markdown: e.target.value })} />
          </div>
        )}
      </div>
    </div>
  );
};

// --- APP ---

export default function App() {
  const [user, setUser] = useState(null); 
  const [view, setView] = useState("list");
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newRole, setNewRole] = useState("");

  // Init Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { console.error("Auth init failed:", error); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setFirebaseUser);
    return () => unsubscribe();
  }, []);

  // Fetch Data
  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(collection(db, "artifacts", appId, "public", "data", "folders"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFolders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Firestore Error:", error));
    return () => unsubscribe();
  }, [firebaseUser]);

  const handleCreate = async () => {
    if (!firebaseUser) return;
    try {
      const ref = generateRef();
      const docRef = await addDoc(collection(db, "artifacts", appId, "public", "data", "folders"), {
        ref, firstName: "", targetRole: newRole, date: serverTimestamp(), markdown: "", status: "draft", versions: []
      });
      setSelectedFolder({ id: docRef.id, ref, firstName: "", targetRole: newRole, markdown: "", status: "draft" });
      setView("detail");
      setShowModal(false);
      setNewRole("");
    } catch (e) { console.error("Create error:", e); }
  };

  const handleUpdate = async (upd) => {
    if (!firebaseUser) return;
    setSelectedFolder(upd);
    const { id, date, ...rest } = upd;
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "folders", id), rest);
  };

  const handleGenerate = async (id) => {
    if (!firebaseUser) return;
    await updateDoc(doc(db, "artifacts", appId, "public", "data", "folders", id), { status: 'pdf_generating' });
    setSelectedFolder((p) => ({ ...p, status: "pdf_generating" }));
    setTimeout(async () => {
      await updateDoc(doc(db, "artifacts", appId, "public", "data", "folders", id), { status: 'pdf_ready' });
      setSelectedFolder((p) => ({ ...p, status: 'pdf_ready' }));
    }, 1200);
  };

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col relative">
      <header className="bg-white border-b h-16 flex items-center justify-between px-6 shadow-sm sticky top-0 z-10">
         <div className="font-bold text-lg text-teal-900 cursor-pointer" onClick={() => setView("list")}>IAMonJob</div>
         <button onClick={() => setUser(null)}><LogOut size={18}/></button>
      </header>
      <main className="flex-1 p-6 overflow-hidden">
        {view === "list" && <FolderList folders={folders} onCreate={() => setShowModal(true)} onSelect={(f) => { setSelectedFolder(f); setView("detail"); }} />}
        {view === "detail" && selectedFolder && <FolderDetail folder={selectedFolder} onBack={() => setView("list")} onSave={handleUpdate} onGenerate={handleGenerate} />}
      </main>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-xl w-96">
            <h3 className="font-bold mb-4">Nouveau dossier</h3>
            <input autoFocus className="w-full border p-2 rounded mb-4" placeholder="Poste visé" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
                <Button disabled={!newRole} onClick={handleCreate}>Créer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
