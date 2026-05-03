// This file is deprecated. Use backend/server.js instead.
// Run: node backend/server.js
console.log('Please run: node backend/server.js');
process.exit(0);

app.use(cors());
app.use(express.json());

// Load or init DB
const loadDB = () => {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ transactions: [] }));
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// GET all transactions
app.get('/api/transactions', (req, res) => {
  const db = loadDB();
  res.json(db.transactions);
});

// POST new transaction
app.post('/api/transactions', (req, res) => {
  const db = loadDB();
  const tx = { id: Date.now(), ...req.body };
  db.transactions.unshift(tx);
  saveDB(db);
  res.json(tx);
});

// DELETE a transaction
app.delete('/api/transactions/:id', (req, res) => {
  const db = loadDB();
  db.transactions = db.transactions.filter(tx => String(tx.id) !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ShuleMeal API running on http://0.0.0.0:${PORT}`);
  console.log(`Phone access: http://192.168.88.190:${PORT}`);
});
