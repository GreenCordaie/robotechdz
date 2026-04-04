
import sqlite3
db_path = r'c:\Users\PC\Desktop\100-pc-IA\database.sqlite'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
print(cursor.fetchall())
conn.close()
