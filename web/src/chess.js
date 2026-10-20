// The chessboard by the fire. The rules live on the Java server (full FIDE: castling, en passant, promotion,
// check, mate, stalemate, repetition, fifty moves); this file only draws the board and sends moves.
import { api, local } from './api.js';

// Solid shapes for both sides, coloured by CSS, so white pieces stay clear on light squares
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const FILES = 'abcdefgh';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function placement(fen) {
  const board = {};
  fen.split(' ')[0].split('/').forEach((row, i) => {
    let f = 0;
    for (const c of row) { if (/\d/.test(c)) f += +c; else { board[FILES[f] + (8 - i)] = c; f++; } }
  });
  return board;
}

export function openChess({ openSheet, hint }) {
  const host = openSheet(`<p class="k">Life · chess</p><h2 id="sheetTitle">Your move</h2>
    <div class="seg" role="tablist"><button role="tab" data-mode="puzzle" aria-selected="true">Puzzle</button><button role="tab" data-mode="openings" aria-selected="false">My openings</button><button role="tab" data-mode="free" aria-selected="false">Free board</button></div>
    <p id="chessMsg" role="status" class="chessmsg"></p>
    <div class="board" id="board" role="grid" aria-label="Chessboard"></div>
    <div class="promo" id="promo" hidden></div>
    <div class="chessbar" id="chessBar"></div>
    <p class="note" id="chessFoot"></p>`);
  const $ = (id) => host.querySelector('#' + id);
  let state = null;   // { start, moves, view, flip, sel, mode, ... }

  const msg = (t) => { $('chessMsg').textContent = t; };

  async function load(start, moves) {
    try { state.view = await api.chessPlay(start, moves); state.start = start; state.moves = moves; }
    catch (e) { msg(e.status === 422 ? 'That move isn’t legal.' : 'Chess needs the server. Start it with ./dev.sh.'); throw e; }
  }

  function draw() {
    const v = state.view, board = placement(v.fen), sel = state.sel;
    const targets = new Set(sel ? v.legal.filter((m) => m.uci.startsWith(sel)).map((m) => m.uci.slice(2, 4)) : []);
    const last = state.moves.length ? state.moves[state.moves.length - 1] : (state.lastMove || '');
    let html = '';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const rank = state.flip ? r + 1 : 8 - r, file = state.flip ? 7 - c : c, sq = FILES[file] + rank, pc = board[sq];
      const light = (file + rank) % 2 === 0; // a1 is dark, h1 is light
      const cls = [light ? 'l' : 'd', sel === sq ? 'sel' : '', targets.has(sq) ? (pc ? 'cap' : 'dot') : '', last.includes(sq) ? 'last' : '', state.okSq === sq ? 'ok' : ''].join(' ');
      const label = `${sq}${pc ? ', ' + (pc === pc.toUpperCase() ? 'white ' : 'black ') + NAME[pc.toLowerCase()] : ''}`;
      html += `<button type="button" role="gridcell" class="${cls}" data-sq="${sq}" aria-label="${label}"><span class="${pc && pc === pc.toUpperCase() ? 'w' : 'b'}">${pc ? GLYPH[pc] : ''}</span></button>`;
    }
    $('board').innerHTML = html;
  }

  function status() {
    const v = state.view;
    if (v.status === 'checkmate') return `Checkmate. ${v.turn === 'white' ? 'Black' : 'White'} wins.`;
    if (v.status === 'stalemate') return 'Stalemate. It’s a draw.';
    if (v.status === 'draw') return `Draw: ${v.reason}.`;
    return `${v.turn === 'white' ? 'White' : 'Black'} to move${v.check ? ', in check' : ''}.`;
  }

  // Tapping squares: pick a piece, then where it goes
  $('board').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sq]'); if (!b || !state || state.busy) return;
    const sq = b.dataset.sq, v = state.view;
    const mine = (s) => v.legal.some((m) => m.uci.startsWith(s));
    if (state.sel && v.legal.some((m) => m.uci.startsWith(state.sel + sq))) {
      const options = v.legal.filter((m) => m.uci.startsWith(state.sel + sq));
      if (options.length > 1) return choosePromotion(options);
      return move(options[0].uci);
    }
    state.sel = mine(sq) && state.sel !== sq ? sq : null;
    draw();
  });

  function choosePromotion(options) {
    const white = state.view.turn === 'white';
    $('promo').hidden = false;
    $('promo').innerHTML = '<span>Promote to</span>' + ['q', 'r', 'b', 'n'].map((p) => `<button type="button" data-promo="${p}" aria-label="${NAME[p]}">${GLYPH[white ? p.toUpperCase() : p]}</button>`).join('');
    $('promo').onclick = (e) => { const p = e.target.closest('[data-promo]'); if (!p) return; $('promo').hidden = true; move(options.find((o) => o.uci.endsWith(p.dataset.promo)).uci); };
  }

  async function move(uci) {
    state.sel = null; state.busy = true;
    try { await state.onMove(uci); } finally { state.busy = false; }
  }

  // ---- Modes ----
  async function puzzle(id) {
    const { puzzles, today, solved } = await api.puzzles().catch(() => ({}));
    if (!puzzles) { msg('Chess needs the server. Start it with ./dev.sh.'); return; }
    const idx = id ?? today, pz = puzzles[idx];
    state = { mode: 'puzzle', flip: pz.fen.split(' ')[1] === 'b', sel: null };
    await load(pz.fen, []);
    msg(`${pz.title}. ${pz.fen.split(' ')[1] === 'w' ? 'White' : 'Black'} to play and mate in one.`);
    $('chessFoot').textContent = solved ? `Solved ${solved} time${solved === 1 ? '' : 's'} by visitors.` : '';
    $('chessBar').innerHTML = `<button class="act ghost" type="button" data-c="hint">Hint</button><button class="act ghost" type="button" data-c="next">Another puzzle</button>`;
    $('chessBar').onclick = (e) => { const c = e.target.closest('[data-c]')?.dataset.c; if (c === 'hint') msg(pz.hint); if (c === 'next') puzzle((idx + 1) % puzzles.length); };
    state.onMove = async (uci) => {
      const r = await api.tryPuzzle(idx, uci).catch(() => null);
      if (!r) return;
      if (r.solved) {
        state.view = { ...state.view, fen: r.fen, legal: [] }; state.lastMove = uci; state.okSq = uci.slice(2, 4); draw();
        msg(`${r.san}. Checkmate. Nicely done.`); local.set('chess:' + idx, true); hint('Puzzle solved.');
      } else { msg(`${r.san} isn’t mate. Look at where the king could escape.`); draw(); }
    };
    draw();
  }

  async function openings(which = 0) {
    const { openings: lines } = await api.openings().catch(() => ({}));
    if (!lines) { msg('Chess needs the server. Start it with ./dev.sh.'); return; }
    const line = lines[which], youWhite = line.side === 'white';
    state = { mode: 'openings', flip: !youWhite, sel: null };
    await load(null, []);
    $('chessBar').innerHTML = lines.map((l, k) => `<button class="act ${k === which ? '' : 'ghost'}" type="button" data-line="${k}">${esc(l.name)}</button>`).join('');
    $('chessBar').onclick = (e) => { const b = e.target.closest('[data-line]'); if (b) openings(+b.dataset.line); };
    $('chessFoot').textContent = line.note;
    const autoplay = async () => {
      // Play the other side's moves until it's the visitor's turn or the line ends
      while (state.moves.length < line.uci.length && (state.moves.length % 2 === 0) !== youWhite) {
        await new Promise((r) => setTimeout(r, 450));
        await load(null, [...state.moves, line.uci[state.moves.length]]); draw();
      }
      if (state.moves.length >= line.uci.length) { msg(`That’s the line: ${line.san.join(' ')}`); api.count('opening').catch(() => {}); }
      else msg(`Your move as ${youWhite ? 'white' : 'black'}. What do I play here?`);
    };
    state.onMove = async (uci) => {
      const want = line.uci[state.moves.length];
      if (uci !== want) { msg(`Legal, but in my line I play ${line.san[state.moves.length]}. Try again.`); draw(); return; }
      await load(null, [...state.moves, uci]); draw(); await autoplay();
    };
    draw(); await autoplay();
  }

  async function free() {
    state = { mode: 'free', flip: false, sel: null };
    await load(null, []);
    const bar = () => {
      $('chessBar').innerHTML = `<button class="act ghost" type="button" data-c="undo">Undo</button><button class="act ghost" type="button" data-c="flip">Flip</button><button class="act ghost" type="button" data-c="reset">Reset</button>${state.view.claimable?.length ? `<button class="act" type="button" data-c="claim">Claim draw</button>` : ''}`;
    };
    $('chessBar').onclick = async (e) => {
      const c = e.target.closest('[data-c]')?.dataset.c;
      if (c === 'undo' && state.moves.length) { await load(null, state.moves.slice(0, -1)); }
      if (c === 'flip') state.flip = !state.flip;
      if (c === 'reset') await load(null, []);
      if (c === 'claim') { msg(`Draw claimed: ${state.view.claimable[0]}.`); state.view = { ...state.view, legal: [] }; draw(); return; }
      bar(); draw(); msg(status());
    };
    $('chessFoot').textContent = 'Both sides, full rules: castling, en passant, promotion, and every way a game can end.';
    state.onMove = async (uci) => { await load(null, [...state.moves, uci]); bar(); draw(); const v = state.view; msg(status() + (v.san.length ? ` Last: ${v.san[v.san.length - 1]}.` : '')); };
    bar(); draw(); msg(status());
  }

  host.querySelector('.seg').addEventListener('click', (e) => {
    const t = e.target.closest('[data-mode]'); if (!t) return;
    host.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
    $('promo').hidden = true;
    ({ puzzle: () => puzzle(), openings: () => openings(), free }[t.dataset.mode])();
  });
  puzzle();
}
