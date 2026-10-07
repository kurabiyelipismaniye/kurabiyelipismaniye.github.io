// Site ayarları. Firebase kurulunca "firebase" alanına Firebase'in verdiği ayar nesnesi yazılır
// (bkz. KURULUM.md). Boş kaldığı sürece site, listeyi data/games.js dosyasından okur.
window.SITE_CONFIG = {
  github: { repo: 'ibrahimeserocak/Youtube', branch: 'main' },
  youtube: { channelUrl: 'https://www.youtube.com/@kurabiyelipismaniye' },
  firebase: {
    apiKey: 'AIzaSyBxICpALj7KPVNJOjV7wX8hIBba2NeZvHQ',
    authDomain: 'kurabiyeli-pismaniye.firebaseapp.com',
    projectId: 'kurabiyeli-pismaniye',
    storageBucket: 'kurabiyeli-pismaniye.firebasestorage.app',
    messagingSenderId: '254175444658',
    appId: '1:254175444658:web:1dac6a686de6240441d3ab'
  },
  firebaseEmulators: null
};
