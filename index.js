'use strict';

const BACKSPACE_KEY = 'Backspace';
const ENTER_KEY = 'Enter';
/*
const WORD_LIST = [
    'SHAKE', 'PASTA', 'PANIC',
    'SKILL', 'ARROW', 'BIRDS'
];
const WORD_OF_THE_DAY = WORD_LIST[0];
*/

//Game state variables
let gameOver = false;
let gameWon = false;
let WORD_LIST = [];
let WORD_OF_THE_DAY = '';
let currentWord = '';
let WORD_LENGTH = 0;
let DAILY_ENTRY = null;
let cluesRevealed = 0;
let CATEGORY_COUNT = 0;
let seriesRules = [];
let currentSeries = '';
const SERIES = ['mcu', 'naruto', 'starwars'];
let headers = [];
let currentSeriesRule = '';
let availableSeries = [];

// Favorites storage key
const FAVORITES_KEY = 'sf_favorites';

// Stats storage key
const STATS_KEY = 'sf_stats';

// Daily submission tracking key
const DAILY_SUBMISSION_KEY = 'sf_daily_submission_date';

// Daily board state storage key
const DAILY_BOARD_STATE_KEY = 'sf_daily_board_state';

//Constants
const MAX_NUMBER_OF_ATTEMPTS = 6;
const history = [];
const input = document.querySelector('#guess-input');
const suggestions = document.querySelector('#suggestions');

const normalizeClue = (value) =>
    value.toString().trim().toLowerCase();

const init = async () => {
    console.log('welcome to Super Fandle!');
    

    await loadWordsFromCSV();

    const gameBoard = document.querySelector('#board');

    const categoryLabels = document.querySelector('.category-labels');
    categoryLabels.innerHTML = headers.map(h => `<span>${h}</span>`).join('');

    generateBoard(gameBoard, MAX_NUMBER_OF_ATTEMPTS, CATEGORY_COUNT + 1);

    // Try to restore board state from today
    const savedState = loadBoardState();
    if (savedState) {
        restoreBoardState(savedState);
    }

    //initClues();
    
    gameBoard.addEventListener('animationend', event => {
        event.target.setAttribute('data-animation', 'idle');
    });

    // Add question mark button
    const guessWrapper = document.querySelector('.guess-input-wrapper');
    const helpButton = document.createElement('button');
    helpButton.id = 'help-button';
    helpButton.textContent = '?';
    helpButton.setAttribute('aria-label', 'Help');
    
    // Create a container for help button and series label
    const helpContainer = document.createElement('div');
    helpContainer.className = 'help-container';
    helpContainer.appendChild(helpButton);
    
    // Add series label
    const seriesLabel = document.createElement('span');
    seriesLabel.id = 'series-label';
    seriesLabel.className = 'series-label';
    seriesLabel.textContent = `${currentSeries} Characters`;
    helpContainer.appendChild(seriesLabel);
    
    guessWrapper.insertAdjacentElement('beforebegin', helpContainer);

    // Add modal
    const modal = document.createElement('div');
    modal.id = 'rules-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>How to Play: </h2>
            <p>Guess the character in ${MAX_NUMBER_OF_ATTEMPTS} tries!</p>
            <p>After each guess, the clues will be marked to indicate whether they match the correct answer.
            For clues with hierarchical values, hints will indicate if the correct value is higher or lower.</p>
            <h2>${currentSeries} Rules</h2>
            <p>${currentSeriesRule}</p>
        </div>
    `;
    document.body.appendChild(modal);

    // Event listeners for modal
    helpButton.addEventListener('click', () => {
        modal.style.display = 'block';
    });

    modal.querySelector('.close').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    // Build Home and Stats UI
    buildHomePanelUI();

    const homeBtn = document.getElementById('home-button');
    const statsBtn = document.getElementById('stats-button');
    const homePanel = document.getElementById('home-panel');
    const statsPanel = document.getElementById('stats-panel');

    if (homeBtn) homeBtn.addEventListener('click', () => { if (homePanel) homePanel.style.display = 'block'; });
    if (statsBtn) statsBtn.addEventListener('click', () => { updateStatsPanelUI(); if (statsPanel) statsPanel.style.display = 'block'; });

    const closeHome = document.getElementById('close-home');
    const closeStats = document.getElementById('close-stats');
    if (closeHome) closeHome.addEventListener('click', () => { if (homePanel) homePanel.style.display = 'none'; });
    if (closeStats) closeStats.addEventListener('click', () => { if (statsPanel) statsPanel.style.display = 'none'; });

    // Welcome modal for first-time visitors
    const welcomeModal = document.getElementById('welcome-modal');
    const SEEN_WELCOME_KEY = 'sf_seen_welcome';
    if (welcomeModal) {
        const seen = localStorage.getItem(SEEN_WELCOME_KEY);
        if (!seen) {
            welcomeModal.style.display = 'block';
        }

        const chooseBtn = document.getElementById('choose-favorites-button');
        const closeWelcome = welcomeModal.querySelector('.close-welcome');

        if (chooseBtn) chooseBtn.addEventListener('click', () => {
            localStorage.setItem(SEEN_WELCOME_KEY, '1');
            const homePanelEl = document.getElementById('home-panel');
            if (homePanelEl) homePanelEl.style.display = 'block';
            welcomeModal.style.display = 'none';
            const list = document.getElementById('series-list');
            if (list) list.querySelectorAll('input[type="checkbox"]')[0]?.focus();
        });

        if (closeWelcome) closeWelcome.addEventListener('click', () => {
            localStorage.setItem(SEEN_WELCOME_KEY, '1');
            welcomeModal.style.display = 'none';
        });

        window.addEventListener('click', (event) => {
            if (event.target === welcomeModal) {
                localStorage.setItem(SEEN_WELCOME_KEY, '1');
                welcomeModal.style.display = 'none';
            }
        });
    }
}

// --- Favorites and Panels ---
const loadFavorites = () => {
    try {
        const f = JSON.parse(localStorage.getItem(FAVORITES_KEY) || 'null');
        if (Array.isArray(f)) return f;
    } catch (e) {}
    return availableSeries.map(s => s.id);
}

const saveFavorites = (favs) => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

const buildHomePanelUI = () => {
    const list = document.getElementById('series-list');
    if (!list) return;

    list.innerHTML = '';
    const favs = loadFavorites();

    // Update daily submission notice
    const notice = document.getElementById('daily-submission-notice');
    if (notice) {
        if (hasSubmittedToday()) {
            notice.textContent = '⏸️ You\'ve already played today. Favorite changes will apply tomorrow.';
            notice.style.display = 'block';
        } else {
            notice.style.display = 'none';
        }
    }

    // local selection state (do not persist until Apply)
    availableSeries.forEach(s => {
        const li = document.createElement('li');
        const id = s.id;
        li.innerHTML = `
            <label><input type="checkbox" data-id="${id}" ${favs.includes(id) ? 'checked' : ''}/> ${s.display}</label>
        `;
        list.appendChild(li);
    });

    const applyBtn = document.getElementById('apply-home');
    const updateApplyState = () => {
        const selected = Array.from(list.querySelectorAll('input[type="checkbox"]'))
            .filter(i => i.checked)
            .map(i => i.dataset.id);

        if (applyBtn) applyBtn.disabled = selected.length === 0;
    };

    // hook up checkbox changes (update local state only)
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            updateApplyState();
        });
    });

    const selectAllBtn = document.getElementById('select-all');
    const deselectAllBtn = document.getElementById('deselect-all');
    if (selectAllBtn) selectAllBtn.addEventListener('click', () => {
        list.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = true);
        updateApplyState();
    });
    if (deselectAllBtn) deselectAllBtn.addEventListener('click', () => {
        list.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
        updateApplyState();
    });

    // Apply button — validate and persist
    if (applyBtn) {
        updateApplyState();
        applyBtn.addEventListener('click', () => {
            const selected = Array.from(list.querySelectorAll('input[type="checkbox"]'))
                .filter(i => i.checked)
                .map(i => i.dataset.id);

            if (!selected || selected.length === 0) {
                showMessage('Select at least one series before applying.');
                return;
            }

            // Check if user has already submitted a guess today
            if (hasSubmittedToday()) {
                showMessage('You\'ve already played today. Changes will apply tomorrow.');
                return;
            }

            saveFavorites(selected);
            // close panel and reload to pick new daily series
            const homePanel = document.getElementById('home-panel');
            if (homePanel) homePanel.style.display = 'none';
            location.reload();
        });
    }
}

// --- Statistics ---
const loadStats = () => {
    try {
        const s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
        if (s && typeof s === 'object') return s;
    } catch (e) {}
    return { gamesPlayed: 0, gamesWon: 0, totalGuessesForWins: 0, consecutiveDaysPlayed: 0, lastPlayedDate: null };
}

const saveStats = (stats) => {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

const getDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD format
};

const hasSubmittedToday = () => {
    const lastSubmissionDate = localStorage.getItem(DAILY_SUBMISSION_KEY);
    const today = getDateString();
    return lastSubmissionDate === today;
};

const markSubmittedToday = () => {
    localStorage.setItem(DAILY_SUBMISSION_KEY, getDateString());
};

const saveBoardState = () => {
    const boardState = {
        date: getDateString(),
        gameOver: gameOver,
        gameWon: gameWon,
        history: [...history],
        boardData: []
    };

    // Save the state of each tile
    const rows = document.querySelectorAll('#board ul[data-row]');
    rows.forEach(row => {
        const rowData = [];
        row.querySelectorAll('li').forEach(tile => {
            rowData.push({
                status: tile.getAttribute('data-status'),
                textContent: tile.textContent
            });
        });
        boardState.boardData.push(rowData);
    });

    localStorage.setItem(DAILY_BOARD_STATE_KEY, JSON.stringify(boardState));
};

const loadBoardState = () => {
    try {
        const state = JSON.parse(localStorage.getItem(DAILY_BOARD_STATE_KEY) || 'null');
        if (state && state.date === getDateString()) {
            return state;
        }
    } catch (e) {}
    return null;
};

const restoreBoardState = (state) => {
    if (!state) return false;

    gameOver = state.gameOver;
    gameWon = state.gameWon;
    history.length = 0;
    history.push(...state.history);

    // Restore tile states
    const rows = document.querySelectorAll('#board ul[data-row]');
    rows.forEach((row, rowIndex) => {
        const tiles = row.querySelectorAll('li');
        if (state.boardData[rowIndex]) {
            tiles.forEach((tile, colIndex) => {
                const tileData = state.boardData[rowIndex][colIndex];
                if (tileData) {
                    tile.setAttribute('data-status', tileData.status);
                    tile.textContent = tileData.textContent;
                }
            });
        }
    });

    // Disable input only if game is over
    const input = document.querySelector('#guess-input');
    if (input && gameOver) input.disabled = true;

    return true;
};

const updateStatsOnGameEnd = (won) => {
    const stats = loadStats();
    const today = getDateString();
    
    stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
    if (won) {
        stats.gamesWon = (stats.gamesWon || 0) + 1;
        stats.totalGuessesForWins = (stats.totalGuessesForWins || 0) + history.length;
    }
    
    // Update consecutive days
    if (stats.lastPlayedDate) {
        const lastDate = new Date(stats.lastPlayedDate);
        const currentDate = new Date(today);
        const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            // Consecutive day
            stats.consecutiveDaysPlayed = (stats.consecutiveDaysPlayed || 0) + 1;
        } else if (diffDays > 1 || diffDays < 0) {
            // Streak broken
            stats.consecutiveDaysPlayed = 1;
        }
        // If diffDays === 0, same day - don't increment
    } else {
        // First time playing
        stats.consecutiveDaysPlayed = 1;
    }
    
    stats.lastPlayedDate = today;
    saveStats(stats);
}

const updateStatsPanelUI = () => {
    const container = document.getElementById('stats-content');
    const stats = loadStats();
    if (!container) return;

    if (!stats || stats.gamesPlayed === 0) {
        container.textContent = 'No data yet, play a game first!';
        return;
    }

    const avg = stats.gamesWon > 0 ? (stats.totalGuessesForWins / stats.gamesWon).toFixed(2) : 'N/A';
    const consecutiveDays = stats.consecutiveDaysPlayed || 0;

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-tile">
                <div class="stat-label">Games Played</div>
                <div class="stat-value">${stats.gamesPlayed}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Games Won</div>
                <div class="stat-value">${stats.gamesWon}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Avg Guesses</div>
                <div class="stat-value">${avg}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Days in a Row</div>
                <div class="stat-value">${consecutiveDays}</div>
            </div>
        </div>
    `;
}

const generateBoard = (board, rows = 6, columns = 5, keys = [], keyboard = false) => {
    for (let row = 0; row < rows; row++) {
        const elmRow = document.createElement('ul');

        elmRow.setAttribute('data-row', row);

        for (let column = 0; column < columns; column++) {
            const elmColumn = document.createElement('li');
            elmColumn.setAttribute('data-status', 'empty');
            elmColumn.setAttribute('data-animation', 'idle');
            
            if (keyboard && keys.length > 0) {
                const key = keys[row].charAt(column);
                elmColumn.textContent = key;
                elmColumn.setAttribute('data-key', key);
            }

            if (keyboard && elmColumn.textContent === '')continue;

            elmRow.appendChild(elmColumn);
        }

        board.appendChild(elmRow)
    }

    if (keyboard) {
        const enterKey = document.createElement('li');
        enterKey.setAttribute('data-key', ENTER_KEY);
        enterKey.textContent = ENTER_KEY;
        board.lastChild.prepend(enterKey);

        const backspaceKey = document.createElement('li');
        backspaceKey.setAttribute('data-key', BACKSPACE_KEY);
        backspaceKey.textContent = 'DEL';
        board.lastChild.append(backspaceKey);
    }
};

const showMessage = (message) => {
    const toast = document.createElement('li');

    toast.textContent = message;
    toast.className = 'toast';

    document.querySelector('.toaster ul').prepend(toast);
    setTimeout(() => toast.classList.add('fade'), 4000);

    toast.addEventListener('transitionend', (event) => event.target.remove());
}

const loadWordsFromCSV = async () => {
    // Load series rules first to get properly formatted series names
    const rulesResponse = await fetch('seriesrules.csv');
    const rulesText = await rulesResponse.text();

    seriesRules = rulesText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const parts = line.split(',', 2);
            const series = parts[0].trim();
            const rule = parts[1] ? parts[1].trim() : '';
            return {
                series,
                rule
            };
        });

    // Build availableSeries with ids that match CSV file names
    availableSeries = seriesRules.map(r => ({
        id: r.series.toLowerCase().replace(/\s+/g, ''),
        display: r.series,
        rule: r.rule
    }));

    // Load favorites from storage (default: all series selected)
    let favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || 'null');
    if (!Array.isArray(favorites)) {
        favorites = availableSeries.map(s => s.id);
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }

    const startDate = new Date('2024-01-01');
    const today = new Date();
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));

    // Ensure we have at least one favorite
    if (favorites.length === 0) {
        favorites = availableSeries.map(s => s.id);
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }

    // Pick the series for this user deterministically from their favorites
    const seriesIndex = daysSinceStart % favorites.length;
    const selectedSeriesId = favorites[seriesIndex];

    const ruleEntry = availableSeries.find(a => a.id === selectedSeriesId) || availableSeries[0];
    currentSeries = ruleEntry ? ruleEntry.display : selectedSeriesId;
    currentSeriesRule = ruleEntry ? ruleEntry.rule : 'No rules available for this series.';

    const csvPath = `series/${selectedSeriesId}.csv`;
    const response = await fetch(csvPath);
    const text = await response.text();

    const lines = text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
    if (lines.length < 2) return;
    headers = lines[0].split(',').map(h => h.trim());
    const dataLines = lines.slice(1);
    const entries = dataLines
        .map(line => {
            const [name, ...clues] = line.split(',');

            return {
                display: name.trim(),
                answer: name.toUpperCase().replace(/[^A-Z]/g, ''),
                clues: clues.map(c => c.trim())
            };
        })
        .filter(entry => entry.answer.length > 0);

    // ✅ WORD_LIST = ALL possible answers (names only)
    WORD_LIST = entries;

    // ✅ Pick daily deterministic entry (with clues)
    DAILY_ENTRY = getDailyWord(entries);

    CATEGORY_COUNT = headers.length - 1;

    WORD_OF_THE_DAY = DAILY_ENTRY.answer;
    WORD_LENGTH = WORD_OF_THE_DAY.length;

    console.log('Name of the Day:', WORD_OF_THE_DAY);
}



const getDailyWord = (words) => {
    const startDate = new Date('2024-01-01');
    const today = new Date();

    startDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);

    const daysSinceStart =
        Math.floor((today - startDate) / (1000 * 60 * 60 * 24));

    if (!Array.isArray(words) || words.length === 0) return null;

    const len = words.length;
    // base index for today
    let index = daysSinceStart % len;

    // avoid picking the same entry two days in a row
    if (len > 1) {
        const prevIndex = ((daysSinceStart - 1) % len + len) % len;

        if (words[prevIndex] && words[index] && words[prevIndex].answer === words[index].answer) {
            // pick the next item to avoid repeat (wraparound safe)
            index = (index + 1) % len;
        }
    }

    return words[index];
}

const initClues = () => {
    const cluesContainer = document.querySelector('#clues');
    cluesContainer.innerHTML = '';

    DAILY_ENTRY.clues.forEach(clue => {
        const tile = document.createElement('div');
        tile.className = 'clue-tile';
        tile.dataset.clue = clue;
        tile.textContent = '???';
        cluesContainer.appendChild(tile);
    });
}

input.addEventListener('input', () => {
    const value = input.value.toLowerCase();
    suggestions.innerHTML = '';

    if (!value) return;

    WORD_LIST
        .filter(entry =>
            entry.display.toLowerCase().includes(value)
        )
        .slice(0, 5)
        .forEach(entry => {
            const li = document.createElement('li');
            li.textContent = entry.display;

            li.addEventListener('click', () => {
                submitGuess(entry);
            });

            suggestions.appendChild(li);
        });
});

const submitGuess = (entry) => {
    if (gameOver) return;

    checkGuess(entry, DAILY_ENTRY);

    input.value = '';
    suggestions.innerHTML = '';
}

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const match = WORD_LIST.find(
            entry =>
                entry.display.toLowerCase() === input.value.toLowerCase()
        );

        if (match) {
            submitGuess(match);
        } else {
            showMessage('Not a valid character');
        }
    }
})

const revealNextClue = () => {
    const clueTiles = document.querySelectorAll('.clue-tile');

    if (cluesRevealed < clueTiles.length) {
        const tile = clueTiles[cluesRevealed];
        tile.textContent = tile.dataset.clue;
        tile.classList.add('revealed');
        cluesRevealed++;
    }
}

const revealAllClues = () => {
    document.querySelectorAll('.clue-tile').forEach(tile => {
        tile.textContent = tile.dataset.clue;
        tile.classList.add('revealed');
    });
}

const renderGuessToBoard = (guess) => {
    const rowIndex = history.length;
    const currentRow = document.querySelector(
        `#board ul[data-row='${rowIndex}']`
    );

    const letters = guess.split('');

    currentRow.querySelectorAll('li').forEach((tile, index) => {
        tile.textContent = letters[index] ?? '';
        tile.setAttribute('data-status', 'filled');
        tile.setAttribute('data-animation', 'pop');
    });
}

const checkGuess = (guessEntry, answerEntry) => {
    const rowIndex = history.length;
    const currentRow = document.querySelector(
        `#board ul[data-row='${rowIndex}']`
    );

    const tiles = currentRow.querySelectorAll('li');

    for (let index = 0; index < CATEGORY_COUNT + 1; index++) {
        const tile = tiles[index];

        if (index === 0) {
            // Name column
            tile.textContent = guessEntry.display;
            tile.setAttribute('data-status', 'name');
            tile.setAttribute('data-animation', 'pop');
            continue;
        }

        const clueIndex = index - 1; // Adjust for name column
        const guessClue = guessEntry.clues[clueIndex];
        const answerClue = answerEntry.clues[clueIndex];

        tile.textContent = guessClue;

        // ensure animation/data-status will be set below

        // Special handling for Age (clueIndex 0), Height (clueIndex 1) and Rank (clueIndex 3)
        const ageIndex = 0;
        const heightIndex = 1;
        const rankIndex = 3;
        if (currentSeries.toLowerCase() === 'naruto') {
            ageIndex = 0;
            heightIndex = 1;
            rankIndex = 3;
        } else if (currentSeries.toLowerCase() === 'onepiece') {
            ageIndex = 0;
            heightIndex = 1;
            rankIndex = 4;
        } else if (currentSeries.toLowerCase() === 'pokemon') {
            ageIndex = 1;
            heightIndex = 2;
            rankIndex = 4;
        }
        const isExact = normalizeClue(guessClue) === normalizeClue(answerClue);

        if (isExact) {
            tile.setAttribute('data-status', 'valid');
        } else if (clueIndex === ageIndex || clueIndex === heightIndex) {
            // numeric comparison for age/height
            const parseNumber = (v) => {
                if (!v) return NaN;
                const n = parseInt(v.toString().replace(/[^0-9-]/g, ''), 10);
                return Number.isFinite(n) ? n : NaN;
            }

            const guessNum = parseNumber(guessClue);
            const answerNum = parseNumber(answerClue);

            if (Number.isNaN(guessNum) || Number.isNaN(answerNum)) {
                // fallback to generic incorrect if non-numeric
                tile.setAttribute('data-status', 'invalid');
            } else if (answerNum > guessNum) {
                tile.setAttribute('data-status', 'higher');
                tile.textContent = `${guessClue} ↑`;
            } else if (answerNum < guessNum) {
                tile.setAttribute('data-status', 'lower');
                tile.textContent = `${guessClue} ↓`;
            } else {
                tile.setAttribute('data-status', 'valid');
            }
        } else if (clueIndex === rankIndex && currentSeries.toLowerCase() === 'naruto') {
            // rank comparison using defined order (high -> low)
            const rankOrder = ['kage', 'leader', 'missing-nin', 'jonin', 'chunin', 'genin'];

            const g = normalizeClue(guessClue);
            const a = normalizeClue(answerClue);

            const gIdx = rankOrder.indexOf(g);
            const aIdx = rankOrder.indexOf(a);

            if (gIdx === -1 || aIdx === -1) {
                // unknown rank values - fallback
                tile.setAttribute('data-status', 'invalid');
            } else if (aIdx < gIdx) {
                // lower index == higher rank
                tile.setAttribute('data-status', 'higher');
                tile.textContent = `${guessClue} ↑`;
            } else if (aIdx > gIdx) {
                tile.setAttribute('data-status', 'lower');
                tile.textContent = `${guessClue} ↓`;
            } else {
                tile.setAttribute('data-status', 'valid');
            }
        } else {
            // generic equality check for other categories (village, nature)
            if (isExact) {
                tile.setAttribute('data-status', 'valid');
            } else {
                tile.setAttribute('data-status', 'none');
            }
        }

        tile.setAttribute('data-animation', 'flip');
        tile.style.animationDelay = `${index * 200}ms`;
    }

    history.push(guessEntry.answer);

    markSubmittedToday();

    // Save board state after every guess for persistence across page refreshes
    saveBoardState();

    if (guessEntry.answer === answerEntry.answer) {
        gameWon = true;
        gameOver = true;
        showEndScreen(true);
        return;
    }

    if (history.length === MAX_NUMBER_OF_ATTEMPTS) {
        gameOver = true;
        showEndScreen(false);
    }
};



const showShareModal = () => {
    const modal = document.getElementById('share-modal');
    const gameDate = document.getElementById('game-date');
    const guessCount = document.getElementById('guess-count');
    const emojiGrid = document.getElementById('emoji-grid');
    
    // Set date
    const today = new Date();
    gameDate.textContent = today.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    // Set guess count
    guessCount.textContent = history.length;
    
    // Generate emoji grid
    emojiGrid.textContent = generateEmojiGrid();
    
    // Show modal
    modal.style.display = 'block';
    
    // Add event listeners
    document.getElementById('share-button').onclick = () => copyToClipboard();
    document.getElementById('close-modal').onclick = () => closeModal();
    
    // Close modal when clicking outside
    modal.onclick = (event) => {
        if (event.target === modal) {
            closeModal();
        }
    };
    
    // Close modal on Escape key
    document.addEventListener('keydown', handleEscapeKey);
}

const generateEmojiGrid = () => {
    const emojiMap = {
        'valid': '🟢',
        'invalid': '🟡',
        'none': '🔘',
        'higher': '🟡',
        'lower': '🟡',
        'name': '🔵'
    };
    
    let grid = '';
    
    // Generate grid for each guess
    for (let row = 0; row < history.length; row++) {
        const rowElement = document.querySelector(`#board ul[data-row='${row}']`);
        const tiles = rowElement.querySelectorAll('li');
        
        for (let col = 0; col < tiles.length; col++) {
            const status = tiles[col].getAttribute('data-status');
            grid += emojiMap[status] || '⚫';
        }
        grid += '\n';
    }
    
    return grid.trim();
}

const copyToClipboard = async () => {
    const gameDate = document.getElementById('game-date').textContent;
    const guessCount = document.getElementById('guess-count').textContent;
    const emojiGrid = document.getElementById('emoji-grid').textContent;
    
    const shareText = `Super Fandle - ${gameDate}\nGuesses: ${guessCount}/6\n\n${emojiGrid}\n\nPlay at: [Your Game URL]`;
    
    try {
        await navigator.clipboard.writeText(shareText);
        showMessage('Copied to clipboard!');
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showMessage('Copied to clipboard!');
    }
}

const closeModal = () => {
    const modal = document.getElementById('share-modal');
    modal.style.display = 'none';
    document.removeEventListener('keydown', handleEscapeKey);
}

const handleEscapeKey = (event) => {
    if (event.key === 'Escape') {
        closeModal();
    }
}

const showEndScreen = (won) => {
    // update persistent stats
    updateStatsOnGameEnd(won);

    const message = won ? `🎉 You Win!` : `💀 Game Over`;
    showMessage(message);
    showMessage(`The word was ${WORD_OF_THE_DAY}`);

    if (won) {
        showShareModal();
    }
}

//Call the initilaization function when the DOM is loaded to get
//everything setup and the game repsonding to any user actions
document.addEventListener('DOMContentLoaded', init);