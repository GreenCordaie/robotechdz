
import os

batch_file = r'c:\Users\PC\Desktop\100-pc-IA\tmp_batch.sql'

with open(batch_file, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Fix common UTF-8 misinterpretations
# Esp├¿ces -> Espèces (è is \xc3\xa8 in UTF-8)
# Cr├®dit -> Crédit (é is \xc3\xa9 in UTF-8)

content = content.replace('Esp├¿ces', 'Espèces')
content = content.replace('Cr├®dit', 'Crédit')

with open(batch_file, 'w', encoding='utf-8') as f:
    f.write(content)

print("Encoding fixed for batch file.")
