const link = document.getElementById('css-theme-link');
const theme = localStorage.getItem('cherri_theme') ?? 'void';

if (theme !== 'void') {
    link.href = `/assets/css/themes/${theme}.css`;
} else {
    link.href = '/assets/css/colors.css';
}