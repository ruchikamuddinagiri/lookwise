
import './App.css'
import LookwiseWidget from './LookwiseWidget'

function App() {

  return (
    <>
      <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f5f5f5",
        padding: "24px",
      }}
    >
      <LookwiseWidget apiBaseUrl="http://localhost:8000" />
    </div>
    </>
  )
}

export default App
