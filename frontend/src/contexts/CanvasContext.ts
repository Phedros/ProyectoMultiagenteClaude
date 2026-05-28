import { createContext, useContext } from 'react'

export interface CanvasContextType {
  topology: string
  supervisorNodeId: string | null   // ReactFlow node id of the supervisor, or null
}

const CanvasContext = createContext<CanvasContextType>({
  topology: 'pipeline',
  supervisorNodeId: null,
})

export const useCanvasContext = () => useContext(CanvasContext)
export default CanvasContext
