'use strict';

const BACKSPACE_KEY = 'Backspace';
const ENTER_KEY = 'Enter';

const MAX_NUMBER_OF_ATTEMPTS = 6;
const history = [];
let currentWord = '';


const init = () => {
    console.log('welcome to Super Fandle!');

    const KEYBOARD_KEYS = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']
    //Grab the gameboard
    const gameBoard = document.querySelector('#board');
    const keyboard = document.querySelector('#keyboard');

    generateBoard(gameBoard);
    generateBoard(keyboard, 3, 10, KEYBOARD_KEYS, true);

    document.addEventListener('keydown', event => onKeyDown(event.key));
    keyboard.addEventListener('click', onKeyboardButtonClick);
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

const onKeyboardButtonClick = (event) => {
    if (event.target.nodeName === 'LI') {
        onKeyDown(event.target.getAttribute('data-key'));
    }
}

const onKeyDown = (key) => {
    //Limit guesses to 6
    if (history.length >= MAX_NUMBER_OF_ATTEMPTS) return;

    const currentRow = document.querySelector(`#board ul[data-row='${history.length}']`);

    let targetColumn = currentRow.querySelector('[data-status="empty"]');

    if (key === BACKSPACE_KEY) {
        if (targetColumn === null) {
            targetColumn = currentRow.querySelector('li:last-child');
        } else {
            targetColumn = targetColumn.previousElementSibling ?? targetColumn;
        }

        targetColumn.textContent = '';
        targetColumn.setAttribute('data-status', 'empty');

        currentWord = currentWord.slice(0, -1);

        return;
    }

    if (currentWord.length >= 5) return;

    const upperCaseLetter = key.toUpperCase();

    if (/^[A-Z]$/.test(upperCaseLetter)) {
        currentWord += upperCaseLetter;

        targetColumn.textContent = upperCaseLetter;
        targetColumn.setAttribute('data-status', 'filled');
        targetColumn.setAttribute('data-animation', 'pop');
    }

    const showMessage = (message) => {
        const toast = document.createElement('li');

        toast.textContent = message;
        toast.className = 'toast';

        document.querySelector('.toaster ul').prepend(toast);
        setTimeout(() => toast.classList.add('fade'), 1000);

        toast.addEventListener('transitionend', (event) => event.target.remove());
    }

    if (key === ENTER_KEY) {
        if (currentWord.length < 5) {
            showMessage('Too short');
            return;
        }
    }
}

//Call the initilaization function when the DOM is loaded to get
//everything setup and the game repsonding to any user actions
document.addEventListener('DOMContentLoaded', init);