import React from "react";

export function Section({title,children,className=""}:{title?:React.ReactNode;children?:React.ReactNode;className?:string;}){
  return (
    <section className={`section ${className}`}>
      {title ? <div className="h-label">{title}</div> : null}
      {children}
    </section>
  );
}
