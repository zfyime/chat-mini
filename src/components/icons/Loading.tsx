export default () => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="0" fill="currentColor">
        <animate attributeName="r" begin="0" dur="1.2s" values="0;11" calcMode="spline" keySplines="0.2,0.2,0.4,0.8" repeatCount="indefinite"/>
        <animate attributeName="opacity" begin="0" dur="1.2s" values="1;0" calcMode="spline" keySplines="0.2,0.2,0.4,0.8" repeatCount="indefinite"/>
      </circle>
      <circle cx="12" cy="12" r="0" fill="currentColor">
        <animate attributeName="r" begin="0.6s" dur="1.2s" values="0;11" calcMode="spline" keySplines="0.2,0.2,0.4,0.8" repeatCount="indefinite"/>
        <animate attributeName="opacity" begin="0.6s" dur="1.2s" values="1;0" calcMode="spline" keySplines="0.2,0.2,0.4,0.8" repeatCount="indefinite"/>
      </circle>
    </svg>
  )
}