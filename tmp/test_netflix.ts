import { NetflixResolverService } from '../src/services/netflix-resolver.service';
import { db } from '../src/db';
import { digitalCodes } from '../src/db/schema';
import { decrypt, encrypt } from '../src/lib/encryption';
import { eq, ilike } from 'drizzle-orm';

async function run() {
    try {
        const email = 'arahamplin5568@outlook.com';
        const password = '11223344@AAa';

        // Rechercher le MS Graph Refresh Token en base
        const account = await db.query.digitalCodes.findFirst({
            where: ilike(digitalCodes.code, `${encrypt(email + '|' + password)}%`)
        });

        // Essayer de résoudre par le service principal Netflix
        const result = await NetflixResolverService.resolve(email, password, undefined, account?.msRefreshToken || undefined);

        console.log("-----------------------------------------");
        console.log("RÉSULTAT DE L'EXTRACTION : ");
        console.log(result);
        console.log("-----------------------------------------");

    } catch (err) {
        console.error('Erreur:', err);
    } finally {
        process.exit(0);
    }
}
run();
