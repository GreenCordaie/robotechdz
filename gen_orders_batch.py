
import sqlite3
import os

# Connect to the local SQLite database
db_path = r'c:\Users\PC\Desktop\100-pc-IA\database.sqlite'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all orders
cursor.execute("SELECT * FROM orders ORDER BY id")
orders = cursor.fetchall()
colnames = [d[0] for d in cursor.description]

# We already have 52 orders. Let's start from index 52.
start_idx = 52
batch_size = 20
batch_orders = orders[start_idx : start_idx + batch_size]

sql_inserts = []
for order in batch_orders:
    values = []
    for val in order:
        if val is None:
            values.append("NULL")
        elif isinstance(val, str):
            # Escape single quotes and handle potential encoding issues
            escaped_val = val.replace("'", "''")
            values.append(f"'{escaped_val}'")
        elif isinstance(val, (int, float)):
            values.append(str(val))
        else:
            values.append(f"'{str(val)}'")
    
    insert_sql = f"INSERT INTO public.orders ({', '.join(colnames)}) VALUES ({', '.join(values)}) ON CONFLICT (id) DO NOTHING;"
    sql_inserts.append(insert_sql)

# Save the batch to a file
with open(r'c:\Users\PC\Desktop\100-pc-IA\tmp_batch_20.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_inserts))

print(f"Generated {len(sql_inserts)} INSERT statements starting from index {start_idx}.")
conn.close()
