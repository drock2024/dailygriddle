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

    generateBoard(gameBoard, MAX_NUMBER_OF_ATTEMPTS, CATEGORY_COUNT);

    //initClues();
    
    gameBoard.addEventListener('animationend', event => {
        event.target.setAttribute('data-animation', 'idle');
    });

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
    setTimeout(() => toast.classList.add('fade'), 2000);

    toast.addEventListener('transitionend', (event) => event.target.remove());
}

const loadWordsFromCSV = async () => {
    const response = await fetch('names.csv');
    const text = await response.text();

    const entries = text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
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

    CATEGORY_COUNT = DAILY_ENTRY.clues.length;

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

    return words[daysSinceStart % words.length];
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

    for (let index = 0; index < CATEGORY_COUNT; index++) {
        const tile = tiles[index];

        const guessClue = guessEntry.clues[index];
        const answerClue = answerEntry.clues[index];

        tile.textContent = guessClue;

        // ensure animation/data-status will be set below

        // Special handling for Age (index 0), Height (index 1) and Rank (index 3)
        const ageIndex = 0;
        const heightIndex = 1;
        const rankIndex = 3;

        const isExact = normalizeClue(guessClue) === normalizeClue(answerClue);

        if (isExact) {
            tile.setAttribute('data-status', 'valid');
        } else if (index === ageIndex || index === heightIndex) {
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
        } else if (index === rankIndex) {
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
            // generic equality check for other categories
            tile.setAttribute('data-status', 'none');
        }

        tile.setAttribute('data-animation', 'flip');
        tile.style.animationDelay = `${index * 200}ms`;
    }

    history.push(guessEntry.answer);

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



const showEndScreen = (won) => {
    const message = won
        ? `🎉 You Win!`
        : `💀 Game Over`;

    showMessage(message);
    showMessage(`The word was ${WORD_OF_THE_DAY}`);
}

//Call the initilaization function when the DOM is loaded to get
//everything setup and the game repsonding to any user actions
document.addEventListener('DOMContentLoaded', init);