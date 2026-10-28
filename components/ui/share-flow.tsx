export default function ShareFlow({formatOnly = false}: {formatOnly?: boolean}) {
  return <ol className="share-flow" aria-label="Fluxo do compartilhamento"><li><span>1</span>Revisar cenário</li><li><span>2</span>{formatOnly ? 'Escolher formato' : 'Escolher canal'}</li><li><span>3</span>Compartilhar</li></ol>;
}
