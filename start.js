const app = require('./app');
const PORT = process.env.PORT || 5110;

app.listen(PORT, () => console.log(`Listening on: ${PORT}`));
