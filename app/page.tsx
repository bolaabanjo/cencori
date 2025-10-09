"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"

export default function Home() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  async function signIn() {
    await supabase.auth.signInWithOtp({
      email: prompt("Enter your email")!,
    })
    alert("Check your email for the login link.")
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  if (!user)
    return <button onClick={signIn}>Sign In with Email</button>

  return (
    <div>
      <p>Signed in as {user.email}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}
