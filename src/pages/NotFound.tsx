export default function NotFound() {
  return (
    <div className="page container notfound">
      <p className="notfound-code">404</p>
      <h1>This page doesn&rsquo;t exist on JACos.</h1>
      <p>The URL you opened isn&rsquo;t a page JACo&rsquo;s Soundcloud knows about.</p>
      <a className="btn btn-orange-solid" href="#/">Back to the front page</a>
    </div>
  );
}
