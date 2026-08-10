/**
 * Erreur metier destinee a etre affichee telle quelle a l'utilisateur.
 * A distinguer d'une erreur technique, dont le detail n'est jamais expose.
 */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BusinessError'
  }
}

export function isBusinessError(error: unknown): error is BusinessError {
  return error instanceof Error && error.name === 'BusinessError'
}
