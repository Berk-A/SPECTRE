import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Download, Upload, Trash2, Copy, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from '@/components/ui'
import { usePrivacy } from '@/hooks/usePrivacy'
import { formatSol, formatDate, copyToClipboard, cn } from '@/lib/utils'
import type { StoredNote } from '@/stores/privacyStore'

interface NoteCardProps {
  note: StoredNote
  onDelete?: (id: string) => void
}

function NoteCard({ note, onDelete }: NoteCardProps) {
  const [showDetails, setShowDetails] = useState(false)

  const handleCopy = async () => {
    await copyToClipboard(note.commitment)
    toast.success('Commitment copied to clipboard')
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <Card className={cn(note.spent && 'opacity-50')}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-neon-cyan/10">
              <FileText className="h-5 w-5 text-neon-cyan" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {formatSol(note.amount)} {note.tokenType}
                </span>
                <Badge variant={note.spent ? 'error' : 'success'}>
                  {note.spent ? 'Spent' : 'Unspent'}
                </Badge>
              </div>
              <p className="text-xs text-white/50">
                {formatDate(new Date(note.createdAt))}
              </p>
            </div>
          </div>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCopy}>
              <Copy className="h-4 w-4" />
            </Button>
            {!note.spent && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="text-status-error hover:text-status-error"
                onClick={() => onDelete(note.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-glass-border"
            >
              <div className="space-y-2 text-xs font-mono">
                <div>
                  <span className="text-white/50">Commitment:</span>
                  <p className="text-white/80 break-all">
                    {note.commitment.slice(0, 32)}...
                  </p>
                </div>
                {note.depositSignature && (
                  <div>
                    <span className="text-white/50">Tx Signature:</span>
                    <p className="text-white/80 break-all">
                      {note.depositSignature.slice(0, 32)}...
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

export function NoteManager() {
  const { notes, unspentNotes, exportNotes, importNotes } = usePrivacy()
  const [showAll, setShowAll] = useState(false)

  const displayedNotes = showAll ? notes : unspentNotes

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          importNotes(content)
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Deposit Notes</CardTitle>
            <CardDescription>
              {unspentNotes.length} unspent notes
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleImport}>
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportNotes}
              disabled={unspentNotes.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {notes.length === 0 ? (
          <div className="text-center py-8 text-white/50">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No deposit notes yet</p>
            <p className="text-sm">Shield some SOL to create a note</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              <AnimatePresence>
                {displayedNotes.map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </AnimatePresence>
            </div>

            {notes.length > unspentNotes.length && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-4"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll
                  ? `Hide spent notes (${notes.length - unspentNotes.length})`
                  : `Show all notes (${notes.length})`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default NoteManager
