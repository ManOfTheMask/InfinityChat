const addFriendBtn = document.getElementById('addFriendBtn') as HTMLButtonElement;
const addFriendModal = document.getElementById('addFriendModal') as HTMLDivElement;
const closeModalBtn = document.getElementById('closeModalBtn') as HTMLButtonElement;
const mainContent = document.getElementById('mainContent') as HTMLDivElement;

addFriendBtn.onclick = () => {
    addFriendModal.classList.remove('hidden');
    mainContent.classList.add('blur-sm');
};

closeModalBtn.onclick = () => {
    addFriendModal.classList.add('hidden');
    mainContent.classList.remove('blur-sm');
};