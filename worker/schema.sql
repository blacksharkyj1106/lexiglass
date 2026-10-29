-- LexiGlass 同步服务的 D1 表结构（可重复执行）
CREATE TABLE IF NOT EXISTS records (
  tbl TEXT NOT NULL,
  k   TEXT NOT NULL,
  v   TEXT NOT NULL,
  u   INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (tbl, k)
);
CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
