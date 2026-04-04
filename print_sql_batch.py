
import sqlite3
import os

orders_file = r'c:\Users\PC\Desktop\100-pc-IA\tmp_batch.sql'

with open(orders_file, 'r', encoding='utf-8') as f:
    sql_lines = f.readlines()

print(f"Read {len(sql_lines)} lines.")

# Filter out empty lines
sql_lines = [line.strip() for line in sql_lines if line.strip()]

print(f"Executing {len(sql_lines)} SQL statements.")

# I will print the SQL lines to the output so I can copy them if needed
# But wait, I can't easily call execute_sql from here.
# I'll just print them and follow up with execute_sql in next turn.
for line in sql_lines:
    print(line)
